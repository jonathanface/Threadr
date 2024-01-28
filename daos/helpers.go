package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

func (d *DAO) awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (err error, awsError models.AwsError) {
	if writeItemsInput == nil {
		return fmt.Errorf("writeItemsInput is nil"), awsError
	}
	maxItemsPerSecond := d.capacity / 2

	for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
		if _, err := d.dynamoClient.TransactWriteItems(context.Background(), writeItemsInput); err == nil {
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
	fmt.Println("checking backup")
	for {
		describeInput := &dynamodb.DescribeBackupInput{
			BackupArn: aws.String(arn),
		}
		output, err := d.dynamoClient.DescribeBackup(context.Background(), describeInput)
		if err != nil {
			return err
		}

		status := output.BackupDescription.BackupDetails.BackupStatus
		if status == types.BackupStatusAvailable {
			fmt.Println("Backup is available.")
			break
		} else if status == types.BackupStatusCreating {
			fmt.Println("Backup is still being created...")
			time.Sleep(10 * time.Second) // Polling interval
		} else {
			return fmt.Errorf("backup creation failed with status: %v", status)
		}
	}
	return nil
}

// Check if a story was "suspended" by an account's subscription not renewing
func (d *DAO) CheckForSuspendedStories(email string) (bool, error) {
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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

func (d *DAO) createBlockTable(tableName string) error {
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

	_, err := d.dynamoClient.CreateTable(context.TODO(), &dynamodb.CreateTableInput{
		TableName:              aws.String(tableName),
		KeySchema:              tableSchema,
		AttributeDefinitions:   attributes,
		BillingMode:            types.BillingModePayPerRequest,
		GlobalSecondaryIndexes: gsiSettings,
	})
	if err != nil {
		return err
	}

	go func() {
		waiter := dynamodb.NewTableExistsWaiter(d.dynamoClient)
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
			_, err := d.dynamoClient.UpdateContinuousBackups(context.TODO(), pitrInput)
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

		_, err := d.dynamoClient.UpdateContinuousBackups(context.Background(), pitrInput)
		if err != nil {
			fmt.Println("error enabling continuous backups", err)
		}
	}()
	return nil
}

func (d *DAO) WasStoryDeleted(email string, storyTitle string) (bool, error) {
	exists, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
	resp, err := d.dynamoClient.DescribeTable(context.TODO(), &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err != nil {
		return "", err
	}
	return string(resp.Table.TableStatus), nil
}
