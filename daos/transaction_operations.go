package daos

import (
	"context"
	"errors"
	"strconv"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) awsWriteTransaction(
	ctx context.Context,
	writeItemsInput *dynamodb.TransactWriteItemsInput,
) (awsError models.AwsError, err error) {
	if writeItemsInput == nil || len(writeItemsInput.TransactItems) == 0 {
		logger.Error("awsWriteTransaction called with nil or empty input")
		return awsError, errors.New("writeItemsInput is nil or empty")
	}

	totalItems := len(writeItemsInput.TransactItems)
	logger.Debug("awsWriteTransaction started",
		"totalItems", totalItems,
		"capacity", d.capacity,
		"maxRetries", d.maxRetries)

	maxItemsPerSecond := d.capacity / 2 //nolint:mnd
	maxTransactions := 100              // AWS limit for TransactWriteItems

	// **Step 1: Split into chunks of 100 (AWS limit)**
	for i := 0; i < len(writeItemsInput.TransactItems); i += maxTransactions {
		end := min(i+maxTransactions, len(writeItemsInput.TransactItems))

		chunk := &dynamodb.TransactWriteItemsInput{
			TransactItems: writeItemsInput.TransactItems[i:end],
		}

		chunkNum := (i / maxTransactions) + 1
		totalChunks := (totalItems + maxTransactions - 1) / maxTransactions
		logger.Debug("Processing transaction chunk",
			"chunkNum", chunkNum,
			"totalChunks", totalChunks,
			"chunkSize", len(chunk.TransactItems))

		// **Step 2: Retry logic with exponential backoff**
		for numRetries := range d.maxRetries {
			_, err := d.DynamoClient.TransactWriteItems(ctx, chunk)
			if err == nil {
				logger.Debug("Transaction chunk succeeded",
					"chunkNum", chunkNum,
					"totalChunks", totalChunks)
				break // Success, continue to next chunk
			}

			// Handle AWS transaction-specific errors
			var txnErr *types.TransactionCanceledException
			if errors.As(err, &txnErr) && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if *reason.Code == "ConditionalCheckFailed" {
						logger.Warn("Transaction conditional check failed",
							"chunkNum", chunkNum,
							"errorCode", *reason.Code,
							"message", *reason.Message)
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

						logger.Warn("Transaction retryable error, retrying",
							"chunkNum", chunkNum,
							"errorCode", *reason.Code,
							"retryAttempt", numRetries+1,
							"maxRetries", d.maxRetries,
							"delay", delay)

						time.Sleep(delay)
						break // Retry loop
					} else if *reason.Code != "None" {
						logger.Error("Transaction non-retryable error",
							"chunkNum", chunkNum,
							"errorCode", *reason.Code,
							"message", *reason.Message)
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return awsError, nil
					}
				}
			} else {
				logger.Error("Transaction error (non-AWS)",
					"error", err,
					"chunkNum", chunkNum)
				return models.AwsError{}, err
			}
		}
	}

	logger.Debug("awsWriteTransaction completed successfully", "totalItems", totalItems)
	return awsError, nil
}

func (d *DAO) generateStoryChapterTransaction(
	storyID, chapterID, chapterTitle string,
	chapter int,
) (types.TransactWriteItem, error) {
	if chapterTitle == "" || storyID == "" || chapterID == "" {
		return types.TransactWriteItem{}, errors.New(
			"CHAPTER CREATION: storyID, chapterID, and chapterTitle params must not be blank",
		)
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
