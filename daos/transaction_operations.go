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
)

func (d *DAO) awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (awsError models.AwsError, err error) {
	if writeItemsInput == nil || len(writeItemsInput.TransactItems) == 0 {
		return awsError, fmt.Errorf("writeItemsInput is nil or empty")
	}

	maxItemsPerSecond := d.capacity / 2
	maxTransactions := 100 // AWS limit for TransactWriteItems

	// **Step 1: Split into chunks of 100 (AWS limit)**
	for i := 0; i < len(writeItemsInput.TransactItems); i += maxTransactions {
		end := i + maxTransactions
		if end > len(writeItemsInput.TransactItems) {
			end = len(writeItemsInput.TransactItems)
		}

		chunk := &dynamodb.TransactWriteItemsInput{
			TransactItems: writeItemsInput.TransactItems[i:end],
		}

		// **Step 2: Retry logic with exponential backoff**
		for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
			_, err := d.DynamoClient.TransactWriteItems(context.Background(), chunk)
			if err == nil {
				break // Success, continue to next chunk
			}

			// Handle AWS transaction-specific errors
			var txnErr *types.TransactionCanceledException
			if errors.As(err, &txnErr) && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if *reason.Code == "ConditionalCheckFailed" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return awsError, nil
					}

					// Handle retryable errors
					if *reason.Code == "TransactionConflict" ||
						*reason.Code == "CapacityExceededException" ||
						*reason.Code == "ResourceInUseException" {

						// Calculate delay for retry
						var delay time.Duration
						if *reason.Code == "CapacityExceededException" {
							delay = time.Duration(float64(time.Second) / float64(maxItemsPerSecond))
						} else {
							delay = time.Duration((1 << uint(numRetries)) * time.Millisecond)
						}

						time.Sleep(delay)
						break // Retry loop
					} else if *reason.Code != "None" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return awsError, nil
					}
				}
			} else {
				return models.AwsError{}, err
			}
		}
	}
	return awsError, nil
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
			TableName:           aws.String("chapters" + GetTableSuffix()),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(story_id) AND attribute_not_exists(chapter_num)"),
		},
	}
	return input, nil
}
