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
) (models.AwsError, error) {
	if writeItemsInput == nil || len(writeItemsInput.TransactItems) == 0 {
		logger.Error("awsWriteTransaction called with nil or empty input")
		return models.AwsError{}, errors.New("writeItemsInput is nil or empty")
	}

	totalItems := len(writeItemsInput.TransactItems)
	logger.Debug("awsWriteTransaction started",
		"totalItems", totalItems, "capacity", d.capacity, "maxRetries", d.maxRetries)

	const maxTransactions = 100         // AWS limit per TransactWriteItems call
	maxItemsPerSecond := d.capacity / 2 //nolint:mnd

	for i := 0; i < totalItems; i += maxTransactions {
		end := min(i+maxTransactions, totalItems)
		chunk := &dynamodb.TransactWriteItemsInput{
			TransactItems: writeItemsInput.TransactItems[i:end],
		}
		chunkNum := (i / maxTransactions) + 1
		totalChunks := (totalItems + maxTransactions - 1) / maxTransactions
		logger.Debug("Processing transaction chunk",
			"chunkNum", chunkNum, "totalChunks", totalChunks, "chunkSize", len(chunk.TransactItems))

		awsErr, err := d.runTxnChunkWithRetries(ctx, chunk, chunkNum, totalChunks, maxItemsPerSecond)
		if err != nil {
			return models.AwsError{}, err
		}
		if !awsErr.IsNil() {
			return awsErr, nil
		}
	}

	logger.Debug("awsWriteTransaction completed successfully", "totalItems", totalItems)
	return models.AwsError{}, nil
}

// runTxnChunkWithRetries calls TransactWriteItems for a single ≤100-item
// chunk and applies the retry policy. Returns (zero-AwsError, nil) on
// eventual success, (awsError, nil) on a terminal AWS-side rejection
// (caller propagates), or (zero, err) on a transport-level error.
func (d *DAO) runTxnChunkWithRetries(
	ctx context.Context,
	chunk *dynamodb.TransactWriteItemsInput,
	chunkNum, totalChunks, maxItemsPerSecond int,
) (models.AwsError, error) {
	for numRetries := range d.maxRetries {
		_, err := d.DynamoClient.TransactWriteItems(ctx, chunk)
		if err == nil {
			logger.Debug("Transaction chunk succeeded", "chunkNum", chunkNum, "totalChunks", totalChunks)
			return models.AwsError{}, nil
		}
		decision := classifyTxnError(err, chunkNum, numRetries, d.maxRetries, maxItemsPerSecond)
		if decision.fatal != nil {
			return models.AwsError{}, decision.fatal
		}
		if decision.terminal != nil {
			return *decision.terminal, nil
		}
		if decision.retryDelay > 0 {
			time.Sleep(decision.retryDelay)
			continue
		}
		// No actionable cancellation reason — preserve original behavior of
		// breaking out of the retry loop (treat as silent success).
		return models.AwsError{}, nil
	}
	return models.AwsError{}, nil
}

// txnRetryDecision is the outcome of inspecting a TransactWriteItems error.
// Exactly one of (fatal, terminal, retryDelay) is set; the empty struct
// means "no actionable reason found in the cancellation list".
type txnRetryDecision struct {
	fatal      error
	terminal   *models.AwsError
	retryDelay time.Duration
}

// classifyTxnError maps a single TransactWriteItems error into a retry
// decision. Non-AWS errors are fatal. AWS cancellation reasons drive the
// rest: ConditionalCheckFailed and other named non-"None" codes terminate
// with the AWS error returned to the caller; TransactionConflict /
// CapacityExceededException / ResourceInUseException trigger a retry with
// computed backoff.
func classifyTxnError(
	err error,
	chunkNum, retryAttempt, maxRetries, maxItemsPerSecond int,
) txnRetryDecision {
	var txnErr *types.TransactionCanceledException
	if !errors.As(err, &txnErr) || txnErr.CancellationReasons == nil {
		logger.Error("Transaction error (non-AWS)", "error", err, "chunkNum", chunkNum)
		return txnRetryDecision{fatal: err}
	}
	for _, reason := range txnErr.CancellationReasons {
		code := *reason.Code
		switch code {
		case "ConditionalCheckFailed":
			logger.Warn("Transaction conditional check failed",
				"chunkNum", chunkNum, "errorCode", code, "message", *reason.Message)
			return txnRetryDecision{terminal: &models.AwsError{
				ErrorType: code, Code: txnErr.ErrorCode(), Text: *reason.Message,
			}}
		case "TransactionConflict", "CapacityExceededException", "ResourceInUseException":
			delay := computeTxnRetryDelay(code, retryAttempt, maxItemsPerSecond)
			logger.Warn("Transaction retryable error, retrying",
				"chunkNum", chunkNum, "errorCode", code,
				"retryAttempt", retryAttempt+1, "maxRetries", maxRetries, "delay", delay)
			return txnRetryDecision{retryDelay: delay}
		case "None":
			// Non-actionable per-reason marker; check the next reason.
			continue
		default:
			logger.Error("Transaction non-retryable error",
				"chunkNum", chunkNum, "errorCode", code, "message", *reason.Message)
			return txnRetryDecision{terminal: &models.AwsError{
				ErrorType: code, Code: txnErr.ErrorCode(), Text: *reason.Message,
			}}
		}
	}
	return txnRetryDecision{}
}

// computeTxnRetryDelay returns the sleep duration for a retryable
// transaction error. Capacity-exceeded gets a fixed pace based on the
// configured throughput; everything else uses exponential backoff.
func computeTxnRetryDelay(code string, retryAttempt, maxItemsPerSecond int) time.Duration {
	if code == "CapacityExceededException" {
		return time.Duration(float64(time.Second) / float64(maxItemsPerSecond))
	}
	return (1 << uint(retryAttempt)) * time.Millisecond
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
		attrStoryID:   &types.AttributeValueMemberS{Value: storyID},
		attrChapterID: &types.AttributeValueMemberS{Value: chapterID},
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
