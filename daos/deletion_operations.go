package daos

import (
	"RichDocter/logger"
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
)

func (d *DAO) SoftDeleteStory(ctx context.Context, email, storyID string, automated bool) error {
	logger.Info("SoftDeleteStory started",
		"email", email,
		"storyId", storyID,
		"automated", automated)

	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Get the story. If not found, return error.
	story, err := d.GetStoryByID(ctx, email, storyID)
	if err != nil {
		logger.Error("Failed to get story for soft delete",
			"error", err,
			"email", email,
			"storyId", storyID)
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
	chapterOut, err := d.DynamoClient.Scan(ctx, chapterScanInput)
	if err != nil {
		logger.Error("Failed to scan chapters for soft delete",
			"error", err,
			"email", email,
			"storyId", storyID)
		return err
	}

	logger.Info("Found chapters to process for soft delete",
		"email", email,
		"storyId", storyID,
		"chapterCount", len(chapterOut.Items))

	// Mark each chapter as deleted (content remains in story_blocks table)
	for _, item := range chapterOut.Items {
		chapterIDAttr, ok := item["chapter_id"].(*types.AttributeValueMemberS)
		if !ok {
			return errors.New("chapter_id missing or not a string")
		}
		chapterID := chapterIDAttr.Value

		chapterKey := map[string]types.AttributeValue{
			"chapter_id": &types.AttributeValueMemberS{Value: chapterID},
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
		}
		updateChapter := &types.Update{
			TableName:        aws.String("chapters" + GetTableSuffix()),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
				":a": &types.AttributeValueMemberBOOL{Value: automated},
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
		series, err := d.GetSeriesByID(ctx, email, seriesID)
		if err != nil {
			logger.Error("Failed to get series for soft delete",
				"error", err,
				"seriesId", seriesID,
				"storyId", storyID,
				"email", email)
			return err
		}
		if len(series.Stories) == 0 {
			// Use seriesID instead of storyID
			storyOrSeriesID = seriesID
			logger.Info("Series has no remaining stories, marking for deletion",
				"seriesId", seriesID,
				"storyId", storyID,
				"email", email)
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
		associationOut, err := d.DynamoClient.Scan(ctx, associationScanInput)
		if err != nil {
			logger.Error("Failed to scan associations for soft delete",
				"error", err,
				"email", email,
				"storyOrSeriesId", storyOrSeriesID)
			return err
		}
		logger.Info("Found associations to process for soft delete",
			"email", email,
			"storyOrSeriesId", storyOrSeriesID,
			"associationCount", len(associationOut.Items))
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
	awsErr, err := d.awsWriteTransaction(ctx, transactions)
	if err != nil {
		logger.Error("Soft delete transaction failed",
			"error", err,
			"email", email,
			"storyId", storyID)
		return err
	}
	if !awsErr.IsNil() {
		logger.Error("Soft delete AWS transaction error",
			"awsCode", awsErr.Code,
			"awsErrorType", awsErr.ErrorType,
			"awsMessage", awsErr.Text,
			"email", email,
			"storyId", storyID)
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	logger.Info("SoftDeleteStory completed successfully",
		"email", email,
		"storyId", storyID,
		"seriesDeleted", deletedSeries,
		"itemsProcessed", len(transactItems))
	return nil
}

func (d *DAO) hardDeleteStory(ctx context.Context, email, storyID string) error {
	logger.Info("HardDeleteStory started",
		"email", email,
		"storyId", storyID)

	originalStory, err := d.GetStoryByID(ctx, email, storyID)
	if err != nil {
		logger.Error("Failed to get story for hard delete",
			"error", err,
			"email", email,
			"storyId", storyID)
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
	chapterOut, err := d.DynamoClient.Scan(ctx, chapterScanInput)
	if err != nil {
		logger.Error("Failed to scan chapters for hard delete",
			"error", err,
			"email", email,
			"storyId", storyID)
		return err
	}

	logger.Info("Found chapters to hard delete",
		"email", email,
		"storyId", storyID,
		"chapterCount", len(chapterOut.Items))

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
		_, err = d.DynamoClient.DeleteItem(ctx, chapterDeleteInput)
		if err != nil {
			logger.Error("Failed to delete chapter",
				"error", err,
				"chapterId", chapterID.Value,
				"storyId", storyID,
				"email", email)
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
	_, err = d.DynamoClient.DeleteItem(ctx, storyDeleteInput)
	if err != nil {
		logger.Error("Failed to delete story",
			"error", err,
			"storyId", storyID,
			"email", email)
		return err
	}
	logger.Info("Story deleted",
		"storyId", storyID,
		"email", email)

	// Delete series
	deletedSeries := false
	storyOrSeriesID := storyID
	if originalStory.SeriesID != "" {
		series, err := d.GetSeriesByID(ctx, email, originalStory.SeriesID)
		if err != nil {
			logger.Error("Failed to get series for hard delete",
				"error", err,
				"seriesId", originalStory.SeriesID,
				"storyId", storyID)
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

			_, err = d.DynamoClient.DeleteItem(ctx, seriesDeleteInput)
			if err != nil {
				logger.Error("Failed to delete series",
					"error", err,
					"seriesId", originalStory.SeriesID,
					"storyId", storyID)
				return err
			}
			// delete series portrait image from s3
			bucketName := "richdocter-series-portraits"
			parsedPath, err := url.Parse(originalStory.ImageURL)
			if err != nil {
				logger.Error("Failed to parse series image URL",
					"error", err,
					"seriesId", originalStory.SeriesID,
					"imageUrl", originalStory.ImageURL)
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				logger.Error("Failed to delete series portrait from S3",
					"error", err,
					"bucket", bucketName,
					"objectKey", objectKey,
					"seriesId", originalStory.SeriesID)
			} else {
				logger.Info("Series deleted successfully",
					"seriesId", originalStory.SeriesID)
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
		associationOut, err := d.DynamoClient.Scan(ctx, associationScanInput)
		if err != nil {
			logger.Error("Failed to scan associations for hard delete",
				"error", err,
				"email", email,
				"storyOrSeriesId", storyOrSeriesID)
			return err
		}

		logger.Info("Found associations to hard delete",
			"email", email,
			"storyOrSeriesId", storyOrSeriesID,
			"associationCount", len(associationOut.Items))

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
			_, err = d.DynamoClient.DeleteItem(ctx, associationDeleteInput)
			if err != nil {
				return err
			}

			associationDetailsDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("association_details" + GetTableSuffix()),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(ctx, associationDetailsDeleteInput)
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

			_, err = d.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				logger.Error("Failed to delete association image from S3",
					"error", err,
					"bucket", bucketName,
					"objectKey", objectKey,
					"associationId", assocID)
			}
		}
		// delete story portrait image from s3
		bucketName := "richdocter-story-portraits"
		parsedPath, err := url.Parse(originalStory.ImageURL)
		if err != nil {
			logger.Error("Failed to parse story image URL",
				"error", err,
				"storyId", storyID,
				"imageUrl", originalStory.ImageURL)
			return err
		}
		objectKey := path.Base(parsedPath.Path)

		_, err = d.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: &bucketName,
			Key:    &objectKey,
		})
		if err != nil {
			logger.Error("Failed to delete story portrait from S3",
				"error", err,
				"bucket", bucketName,
				"objectKey", objectKey,
				"storyId", storyID)
		}
	}

	logger.Info("HardDeleteStory completed successfully",
		"email", email,
		"storyId", storyID,
		"seriesDeleted", deletedSeries)
	return nil
}

// RestoreStory removes the deleted_at flag from a soft-deleted story
func (d *DAO) RestoreStory(ctx context.Context, email, storyID string) error {
	logger.Info("RestoreStory started", "email", email, "storyID", storyID)

	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: storyID},
			"author":   &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
	}

	if _, err := d.DynamoClient.UpdateItem(ctx, input); err != nil {
		logger.Error("Failed to restore story", "error", err, "email", email, "storyID", storyID)
		return err
	}

	logger.Info("Story restored successfully", "email", email, "storyID", storyID)
	return nil
}

// RestoreSeries removes the deleted_at flag from a soft-deleted series
func (d *DAO) RestoreSeries(ctx context.Context, email, seriesID string) error {
	logger.Info("RestoreSeries started", "email", email, "seriesID", seriesID)

	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("series" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"series_id": &types.AttributeValueMemberS{Value: seriesID},
			"author":    &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
	}

	if _, err := d.DynamoClient.UpdateItem(ctx, input); err != nil {
		logger.Error("Failed to restore series", "error", err, "email", email, "seriesID", seriesID)
		return err
	}

	logger.Info("Series restored successfully", "email", email, "seriesID", seriesID)
	return nil
}
