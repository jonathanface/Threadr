package daos

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"path"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

func (d *DAO) SoftDeleteStory(email, storyID string, automated bool) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Get the story. If not found, return error.
	story, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	seriesID := story.SeriesID
	storyOrSeriesID := storyID
	deletedSeries := false

	var transactItems []types.TransactWriteItem

	// --- Process Chapters ---
	// Scan the "chapters" table for active (not yet deleted) chapters for this story.
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	// For each chapter item, add an Update operation to mark it as deleted.
	for _, item := range chapterOut.Items {
		chapterIDAttr, ok := item["chapter_id"].(*types.AttributeValueMemberS)
		if !ok {
			return errors.New("chapter_id missing or not a string")
		}
		chapterTitleAttr, ok := item["title"].(*types.AttributeValueMemberS)
		if !ok {
			return errors.New("title missing or not a string")
		}
		chapterID := chapterIDAttr.Value
		chapterTitle := chapterTitleAttr.Value
		oldTableName := storyID + "_" + chapterID + "_blocks" + GetTableSuffix()

		// Create the BackupTableInput
		input := &dynamodb.CreateBackupInput{
			TableName:  aws.String(oldTableName),
			BackupName: aws.String(oldTableName + "-backup-" + time.Now().Format("2006-01-02-15-04-05")),
		}

		// Create the backup
		buResponse, err := d.DynamoClient.CreateBackup(context.TODO(), input)
		tableNotFound := false
		if err != nil {
			if opErr, ok := err.(*smithy.OperationError); ok {
				var txnErr *types.TableNotFoundException
				if errors.As(opErr.Unwrap(), &txnErr) {
					tableNotFound = true
					fmt.Printf("Table %s not found, skipping", oldTableName)
				}
			}
			if !tableNotFound {
				fmt.Printf("Failed to create backup for table %s, %v", oldTableName, err)
				return err
			}
		}

		backupARN := ""
		if !tableNotFound {
			backupARN = *buResponse.BackupDetails.BackupArn
			err = d.checkBackupStatus(*buResponse.BackupDetails.BackupArn)
			if err != nil {
				return err
			}
			if err := waitForTableStatus(context.TODO(), d.DynamoClient, oldTableName, chapterTitle, "ACTIVE", 5*time.Minute); err != nil {
				return fmt.Errorf("chapter blocks table %s not ACTIVE before delete: %w", oldTableName, err)
			}
			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(oldTableName),
			}

			for numRetries := 0; numRetries < d.maxRetries; numRetries++ {

				if _, err = d.DynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
					if opErr, ok := err.(*smithy.OperationError); ok {
						var useErr *types.ResourceInUseException
						if errors.As(opErr.Unwrap(), &useErr) {
							delay := time.Duration((1 << uint(numRetries)) * (2 * time.Second))
							if numRetries < d.maxRetries-1 {
								fmt.Println("retrying block table deletion in", delay)
								time.Sleep(delay)
								continue
							} else {
								return err
							}
						}
					}
				}
				break
			}
		}

		chapterKey := map[string]types.AttributeValue{
			"chapter_id": &types.AttributeValueMemberS{Value: chapterID},
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
		}
		updateChapter := &types.Update{
			TableName:        aws.String("chapters" + GetTableSuffix()),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a, bup_arn = :barn"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n":    &types.AttributeValueMemberN{Value: now},
				":a":    &types.AttributeValueMemberBOOL{Value: automated},
				":barn": &types.AttributeValueMemberS{Value: backupARN},
			},
		}
		transactItems = append(transactItems, types.TransactWriteItem{
			Update: updateChapter,
		})
	}

	// --- Process Series ---
	// If the story is part of a series, and if the series now has no stories,
	// then update the series item.
	if seriesID != "" {
		series, err := d.GetSeriesByID(email, seriesID)
		if err != nil {
			return err
		}
		if len(series.Stories) == 0 {
			// Use seriesID instead of storyID
			storyOrSeriesID = seriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: seriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdate := &types.Update{
				TableName:        aws.String("series" + GetTableSuffix()),
				Key:              seriesKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: seriesUpdate,
			})
			deletedSeries = true
		}
	}

	// --- Process Associations ---
	// If this story (or series) has associations and either there is no series or the series was deleted,
	// update the associations to mark them as deleted.
	if seriesID == "" || deletedSeries {
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations" + GetTableSuffix()),
			FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at) AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.DynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}
		for _, item := range associationOut.Items {
			assocIDAttr, ok := item["association_id"].(*types.AttributeValueMemberS)
			if !ok {
				return errors.New("association_id missing or not a string")
			}
			assocID := assocIDAttr.Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdate := &types.Update{
				TableName:        aws.String("associations" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: associationUpdate,
			})
			associationDetailsUpdate := &types.Update{
				TableName:        aws.String("association_details" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: associationDetailsUpdate,
			})
		}
	}

	// --- Process Story Update ---
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyUpdate := &types.Update{
		TableName:        aws.String("stories" + GetTableSuffix()),
		Key:              storyKey,
		UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
			":a": &types.AttributeValueMemberBOOL{Value: automated},
		},
	}
	transactItems = append(transactItems, types.TransactWriteItem{
		Update: storyUpdate,
	})

	// Finally, create a TransactWriteItemsInput with all operations.
	transactions := &dynamodb.TransactWriteItemsInput{
		TransactItems: transactItems,
	}
	awsErr, err := d.awsWriteTransaction((transactions))
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) hardDeleteStory(email, storyID string) error {
	originalStory, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("author = :eml AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	for _, item := range chapterOut.Items {
		chapterID := item["id"].(*types.AttributeValueMemberS)
		// Delete associated tables
		chapterKey := map[string]types.AttributeValue{
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
			"chapter_id": chapterID,
		}
		chapterDeleteInput := &dynamodb.DeleteItemInput{
			TableName: aws.String("chapters" + GetTableSuffix()),
			Key:       chapterKey,
		}
		_, err = d.DynamoClient.DeleteItem(context.Background(), chapterDeleteInput)
		if err != nil {
			return err
		}
	}

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyDeleteInput := &dynamodb.DeleteItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Key:       storyKey,
	}
	_, err = d.DynamoClient.DeleteItem(context.Background(), storyDeleteInput)
	if err != nil {
		return err
	}

	// Delete series
	deletedSeries := false
	storyOrSeriesID := storyID
	if originalStory.SeriesID != "" {
		series, err := d.GetSeriesByID(email, originalStory.SeriesID)
		if err != nil {
			return err
		}
		if len(series.Stories)-1 <= 0 {
			storyOrSeriesID = series.ID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: originalStory.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("series" + GetTableSuffix()),
				Key:       seriesKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), seriesDeleteInput)
			if err != nil {
				return err
			}
			// delete series portrait image from s3
			bucketName := "richdocter-series-portraits"
			parsedPath, err := url.Parse(originalStory.ImageURL)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
			deletedSeries = true
		}
	}

	if originalStory.SeriesID == "" || deletedSeries {

		// Delete associations
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations" + GetTableSuffix()),
			FilterExpression: aws.String("author = :eml AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.DynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("associations" + GetTableSuffix()),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), associationDeleteInput)
			if err != nil {
				return err
			}

			associationDetailsDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("association_details" + GetTableSuffix()),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), associationDetailsDeleteInput)
			if err != nil {
				return err
			}
			// delete association images
			var bucketName string
			switch item["association_type"].(*types.AttributeValueMemberS).Value {
			case "character":
				bucketName = "richdocterportraits"
			case "event":
				bucketName = "richdocterevents"
			case "location":
				bucketName = "richdocterlocations"
			}
			parsedPath, err := url.Parse(item["portrait"].(*types.AttributeValueMemberS).Value)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
		}
		// delete story portrait image from s3
		bucketName := "richdocter-story-portraits"
		parsedPath, err := url.Parse(originalStory.ImageURL)
		if err != nil {
			return err
		}
		objectKey := path.Base(parsedPath.Path)

		_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
			Bucket: &bucketName,
			Key:    &objectKey,
		})
		if err != nil {
			fmt.Println("DELETE IMAGE ERROR:", err)
		}
	}
	return nil
}
