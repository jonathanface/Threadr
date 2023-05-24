package daos

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

func (d *DAO) awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (awsError error) {
	if writeItemsInput == nil {
		return fmt.Errorf("writeItemsInput is nil")
	}
	maxItemsPerSecond := d.capacity / 2

	for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
		if _, err := d.dynamoClient.TransactWriteItems(context.Background(), writeItemsInput); err == nil {
			return nil
		} else if opErr, ok := err.(*smithy.OperationError); ok {
			var txnErr *types.TransactionCanceledException

			if errors.As(opErr.Unwrap(), &txnErr) && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if *reason.Code == "ConditionalCheckFailed" {
						return err
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
						return err
					}
				}
			} else {
				return err
			}
		} else {
			return err
		}
	}
	return fmt.Errorf("transaction cancelled after %d retries", d.maxRetries)
}

func (d *DAO) generateStoryChapterTransaction(email string, story string, chapter int, chapterTitle string) (types.TransactWriteItem, error) {
	if email == "" || story == "" || chapterTitle == "" {
		return types.TransactWriteItem{}, fmt.Errorf("CHAPTER CREATION: Email, story, and chapterTitle params must not be blank")
	}
	chapterNumStr := strconv.Itoa(chapter)

	input := types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String("chapters"),
			Key: map[string]types.AttributeValue{
				"chapter_title": &types.AttributeValueMemberS{Value: chapterTitle},
				"story_title":   &types.AttributeValueMemberS{Value: story},
			},
			ConditionExpression: aws.String("attribute_not_exists(series_title) AND attribute_not_exists(story_title)"),
			UpdateExpression:    aws.String("set chapter_num=:n, author=:a"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: chapterNumStr},
				":a": &types.AttributeValueMemberS{Value: email},
			},
		},
	}
	return input, nil
}

func (d *DAO) sanitizeTableName(name string) string {
	tablenamePattern := regexp.MustCompile(`[^\w.-]+`)
	return strings.ToLower(tablenamePattern.ReplaceAllString(name, ""))
}

func (d *DAO) createBlockTable(tableName string) error {
	partitionKey := aws.String("key_id")
	gsiPartKey := aws.String("story")
	gsiSortKey := aws.String("place")

	tableSchema := []types.KeySchemaElement{
		{
			AttributeName: partitionKey,
			KeyType:       types.KeyTypeHash,
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
			IndexName: aws.String("story-place-index"),
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
