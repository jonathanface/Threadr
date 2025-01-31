package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"net/url"
	"path"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

func (d *DAO) awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (err error, awsError models.AwsError) {
	if writeItemsInput == nil {
		return fmt.Errorf("writeItemsInput is nil"), awsError
	}
	maxItemsPerSecond := d.capacity / 2

	for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
		if _, err := d.DynamoClient.TransactWriteItems(context.Background(), writeItemsInput); err == nil {
			return nil, awsError
		} else if opErr, ok := err.(*smithy.OperationError); ok {
			var txnErr *types.TransactionCanceledException
			if errors.As(opErr.Unwrap(), &txnErr) && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if *reason.Code == "ConditionalCheckFailed" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return nil, awsError
					}
					// For other types of cancellation reasons, we retry.
					if *reason.Code == "TransactionConflict" ||
						*reason.Code == "CapacityExceededException" ||
						*reason.Code == "ResourceInUseException" {
						var delay time.Duration
						if reason.Code == aws.String("CapacityExceededException") {
							delay = time.Duration(float64(time.Second) / float64(maxItemsPerSecond))
						} else {
							delay = time.Duration((1 << uint(numRetries)) * time.Millisecond)
						}
						time.Sleep(delay)
						break
					} else if *reason.Code != "None" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return nil, awsError
					}
				}
			} else {
				return err, models.AwsError{}
			}
		} else {
			return err, models.AwsError{}
		}
	}
	return fmt.Errorf("transaction cancelled after %d retries", d.maxRetries), models.AwsError{}
}

func (d *DAO) generateStoryChapterTransaction(storyID, chapterID, chapterTitle string, chapter int) (types.TransactWriteItem, error) {
	if chapterTitle == "" || storyID == "" || chapterID == "" {
		return types.TransactWriteItem{}, fmt.Errorf("CHAPTER CREATION: storyID, chapterID, and chapterTitle params must not be blank")
	}
	chapterNumStr := strconv.Itoa(chapter)
	attributes := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: storyID},
		"chapter_id":  &types.AttributeValueMemberS{Value: chapterID},
		"chapter_num": &types.AttributeValueMemberN{Value: chapterNumStr},
		"title":       &types.AttributeValueMemberS{Value: chapterTitle},
	}
	input := types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("chapters"),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(story_id) AND attribute_not_exists(chapter_num)"),
		},
	}
	return input, nil
}

func (d *DAO) checkBackupStatus(arn string) error {
	for {
		describeInput := &dynamodb.DescribeBackupInput{
			BackupArn: aws.String(arn),
		}
		output, err := d.DynamoClient.DescribeBackup(context.Background(), describeInput)
		if err != nil {
			return err
		}

		status := output.BackupDescription.BackupDetails.BackupStatus
		if status == types.BackupStatusAvailable {
			break
		} else if status == types.BackupStatusCreating {
			time.Sleep(10 * time.Second) // Polling interval
		} else {
			return fmt.Errorf("backup creation failed with status: %v", status)
		}
	}
	return nil
}

// Check if a story was "suspended" by an account's subscription not renewing
func (d *DAO) CheckForSuspendedStories(email string) (bool, error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return false, err
	}
	if len(out.Items) > 0 {
		return true, nil
	}
	return false, nil
}

func (d *DAO) createBlockTable(tableName string, tags *[]types.Tag) error {
	partitionKey := aws.String("key_id")
	gsiPartKey := aws.String("story_id")
	gsiSortKey := aws.String("place")

	tableSchema := []types.KeySchemaElement{
		{
			AttributeName: partitionKey,
			KeyType:       types.KeyTypeHash, // Partition key
		},
	}

	gsiSchema := []types.KeySchemaElement{
		{
			AttributeName: gsiPartKey,
			KeyType:       types.KeyTypeHash,
		},
		{
			AttributeName: gsiSortKey,
			KeyType:       types.KeyTypeRange,
		},
	}
	attributes := []types.AttributeDefinition{
		{
			AttributeName: partitionKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiPartKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiSortKey,
			AttributeType: types.ScalarAttributeTypeN,
		},
	}

	gsiSettings := []types.GlobalSecondaryIndex{
		{
			IndexName: aws.String("story_id-place-index"),
			KeySchema: gsiSchema,
			Projection: &types.Projection{
				ProjectionType: types.ProjectionTypeAll,
			},
		},
	}

	_, err := d.DynamoClient.CreateTable(context.TODO(), &dynamodb.CreateTableInput{
		TableName:              aws.String(tableName),
		KeySchema:              tableSchema,
		AttributeDefinitions:   attributes,
		BillingMode:            types.BillingModePayPerRequest,
		GlobalSecondaryIndexes: gsiSettings,
		Tags:                   tags,
	})
	if err != nil {
		return err
	}

	go func() {
		waiter := dynamodb.NewTableExistsWaiter(d.DynamoClient)
		if err = waiter.Wait(context.TODO(), &dynamodb.DescribeTableInput{
			TableName: aws.String(tableName),
		}, 1*time.Minute); err != nil {
			fmt.Println("error waiting for table creation", err)
			return
		}
		// Enable Point-in-Time Recovery (PITR)
		pitrInput := &dynamodb.UpdateContinuousBackupsInput{
			TableName: aws.String(tableName),
			PointInTimeRecoverySpecification: &types.PointInTimeRecoverySpecification{
				PointInTimeRecoveryEnabled: aws.Bool(true),
			},
		}

		for {
			_, err := d.DynamoClient.UpdateContinuousBackups(context.TODO(), pitrInput)
			if err == nil {
				break // PITR enabled successfully
			}

			// Check if the error indicates ongoing backup enablement
			if err.Error() == "ContinuousBackupsUnavailableException: Backups are being enabled for the table" {
				fmt.Println("enabling backups error", err)
				return
			}
			fmt.Println("Backups are being enabled for the table. Retrying in 10 seconds...")
			time.Sleep(10 * time.Second)
		}

		_, err := d.DynamoClient.UpdateContinuousBackups(context.Background(), pitrInput)
		if err != nil {
			fmt.Println("error enabling continuous backups", err)
		}
	}()
	return nil
}

func (d *DAO) WasStoryDeleted(email string, storyTitle string) (bool, error) {
	exists, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_title=:s AND attribute_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyTitle},
		},
	})
	if err != nil {
		return false, err
	}
	if len(exists.Items) > 0 {
		return true, nil
	}
	return false, nil
}

// check if passed story is a member of a series
// return series ID if yes, blank if no
func (d *DAO) IsStoryInASeries(email string, storyID string) (string, error) {
	var (
		err   error
		story *models.Story
	)
	story, err = d.GetStoryByID(email, storyID)
	if err != nil {
		return "", err
	}
	return story.SeriesID, nil
}

func (d *DAO) GetTotalCreatedStories(email string) (storiesCount int, err error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return 0, err
	}
	storiesCount = int(out.Count)
	return
}

func (d *DAO) CheckTableStatus(tableName string) (string, error) {
	resp, err := d.DynamoClient.DescribeTable(context.TODO(), &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err != nil {
		return "", err
	}
	return string(resp.Table.TableStatus), nil
}

// func (d *DAO) waitForTableToGoActive(tableName string, maxRetries int, delayBetweenRetries time.Duration) error {
// 	for i := 0; i < maxRetries; i++ {
// 		resp, err := d.DynamoClient.DescribeTable(context.TODO(), &dynamodb.DescribeTableInput{
// 			TableName: &tableName,
// 		})
// 		if err != nil {
// 			return err
// 		}

// 		if resp.Table.TableStatus == types.TableStatusActive {
// 			return nil
// 		}
// 		time.Sleep(delayBetweenRetries)
// 	}
// 	return fmt.Errorf("table %s did not become active after %d retries", tableName, maxRetries)
// }

// func (d *DAO) copyTableContents(email, srcTableName, destTableName string) error {
// 	describeInput := &dynamodb.DescribeTableInput{
// 		TableName: &destTableName,
// 	}
// 	describeResp, err := d.DynamoClient.DescribeTable(context.TODO(), describeInput)
// 	var resourceNotFoundErr *types.ResourceNotFoundException
// 	if err != nil {
// 		return err
// 	}
// 	if err == nil {
// 		// The destination table exists, check its status.
// 		if describeResp.Table.TableStatus != types.TableStatusActive {
// 			// Table exists but is not active, you may need to wait.
// 			err = d.waitForTableToGoActive(destTableName, 20, time.Second*1)
// 			if err != nil {
// 				return fmt.Errorf("destination table %s is not ready: %v", destTableName, err)
// 			}
// 		}
// 	} else if !errors.As(err, &resourceNotFoundErr) {
// 		// Other error other than not found, fail the operation.
// 		return fmt.Errorf("error checking status of destination table %s: %v", destTableName, err)
// 	}

// 	paginator := dynamodb.NewScanPaginator(d.DynamoClient, &dynamodb.ScanInput{
// 		TableName: &srcTableName,
// 	})
// 	for paginator.HasMorePages() {
// 		page, err := paginator.NextPage(context.TODO())
// 		if err != nil {
// 			return err
// 		}

// 		for _, item := range page.Items {
// 			_, err := d.DynamoClient.PutItem(context.TODO(), &dynamodb.PutItemInput{
// 				TableName: &destTableName,
// 				Item:      item,
// 			})

// 			if err != nil {
// 				return err
// 			}
// 		}
// 	}
// 	return nil
// }

func (d *DAO) RestoreAutomaticallyDeletedStories(email string) error {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return err
	}

	var stories []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return err
	}
	for _, story := range stories {
		chapterScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("chapters"),
			FilterExpression: aws.String("attribute_exists(deleted_at) AND story_id = :sid AND attribute_exists(bup_arn)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: story.ID},
			},
			Select: types.SelectAllAttributes,
		}
		chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
		if err != nil {
			return err
		}
		var chapters []models.Chapter
		if err = attributevalue.UnmarshalListOfMaps(chapterOut.Items, &chapters); err != nil {
			return err
		}
		for _, chapter := range chapters {
			oldTableName := story.ID + "_" + chapter.ID + "_blocks"
			_, err := d.DynamoClient.RestoreTableFromBackup(context.TODO(), &dynamodb.RestoreTableFromBackupInput{
				BackupArn:       aws.String(chapter.BackupARN),
				TargetTableName: aws.String(oldTableName),
			})
			if err != nil {
				return err
			}
			chapterKey := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: chapter.ID},
				"story_id":   &types.AttributeValueMemberS{Value: story.ID},
			}
			chapterUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("chapters"),
				Key:              chapterKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
			if err != nil {
				return err
			}
		}
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              storyKey,
			UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
		}
		_, err = d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return err
		}

		storyOrSeriesID := story.ID
		if story.SeriesID != "" {
			storyOrSeriesID = story.SeriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: story.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("series"),
				Key:              seriesKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
			if err != nil {
				return err
			}
		}

		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations"),
			FilterExpression: aws.String("author = :eml AND attribute_exists(deleted_at) AND automated_deletion = :a AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":a":   &types.AttributeValueMemberBOOL{Value: true},
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
			associationUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("associations"),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationUpdateInput)
			if err != nil {
				return err
			}

			associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("association_details"),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (d *DAO) SoftDeleteStory(email, storyID string, automated bool) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
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

	chapterCount := 0
	for _, item := range chapterOut.Items {
		// Delete associated tables
		chapterID := item["chapter_id"].(*types.AttributeValueMemberS).Value
		oldTableName := storyID + "_" + chapterID + "_blocks"
		chapterStatus, err := d.CheckTableStatus(oldTableName)
		if err != nil {
			return err
		}
		if chapterStatus != "ACTIVE" {
			time.Sleep(1 * time.Second)
			go d.SoftDeleteStory(email, storyID, automated)
			return nil
		}
		deleteTableInput := &dynamodb.DeleteTableInput{
			TableName: aws.String(oldTableName),
		}

		fmt.Println("backing up", oldTableName+"-backup-"+time.Now().Format("2006-01-02-15-04-05"))

		// Create the BackupTableInput
		input := &dynamodb.CreateBackupInput{
			TableName:  aws.String(oldTableName),
			BackupName: aws.String(oldTableName + "-backup-" + time.Now().Format("2006-01-02-15-04-05")),
		}

		// Create the backup
		buResponse, err := d.DynamoClient.CreateBackup(context.TODO(), input)
		if err != nil {
			fmt.Printf("Failed to create backup for table %s, %v", oldTableName, err)
			return err
		}

		err = d.checkBackupStatus(*buResponse.BackupDetails.BackupArn)
		if err != nil {
			return err
		}

		for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
			var deletionOutput *dynamodb.DeleteTableOutput
			if deletionOutput, err = d.DynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
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
			fmt.Println("deletion output", deletionOutput)
			break
		}
		chapterCount++

		chapterKey := map[string]types.AttributeValue{
			"chapter_id": &types.AttributeValueMemberS{Value: chapterID},
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
		}
		chapterUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("chapters"),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a, bup_arn = :barn"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n":    &types.AttributeValueMemberN{Value: now},
				":a":    &types.AttributeValueMemberBOOL{Value: automated},
				":barn": &types.AttributeValueMemberS{Value: *buResponse.BackupDetails.BackupArn},
			},
		}
		_, err = d.DynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
		if err != nil {
			return err
		}
	}

	story, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	seriesID := story.SeriesID

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories"),
		Key:              storyKey,
		UpdateExpression: aws.String("set deleted_at = :n, automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
			":a": &types.AttributeValueMemberBOOL{Value: automated},
		},
	}
	_, err = d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
	if err != nil {
		return err
	}

	storyOrSeriesID := storyID
	deletedSeries := false
	// Delete series IF no remaining stories assigned
	if seriesID != "" {
		series, err := d.GetSeriesByID(email, seriesID)
		if err != nil {
			return err
		}
		if len(series.Stories)-1 <= 0 {
			storyOrSeriesID = seriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: seriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("series"),
				Key:              seriesKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
			if err != nil {
				return err
			}
			deletedSeries = true
		}
	}

	if seriesID == "" || deletedSeries {
		// Delete associations
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations"),
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
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("associations"),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationUpdateInput)
			if err != nil {
				return err
			}

			associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("association_details"),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
			if err != nil {
				return err
			}
		}
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
		TableName:        aws.String("chapters"),
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
			TableName: aws.String("chapters"),
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
		TableName: aws.String("stories"),
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
				TableName: aws.String("series"),
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
			TableName:        aws.String("associations"),
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
				TableName: aws.String("associations"),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), associationDeleteInput)
			if err != nil {
				return err
			}

			associationDetailsDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("association_details"),
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

func (d *DAO) AddStripeData(email, subscriptionID, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users"),
		Key:              key,
		UpdateExpression: aws.String("set subscription_id=:s, customer_id=:c"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: *subscriptionID},
			":c": &types.AttributeValueMemberS{Value: *customerID},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err := d.DynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		fmt.Println("error saving", err)
		return err
	}
	return nil
}
