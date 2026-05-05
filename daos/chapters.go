package daos

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

const (
	StoryBlocksTableName = "story_blocks"
)

// GetStoryBlocksTableName returns the full table name with environment suffix.
func GetStoryBlocksTableName() string {
	return StoryBlocksTableName + GetTableSuffix()
}

// buildCompositeKey creates the composite key for story_blocks table.
func buildCompositeKey(storyID, chapterID string) string {
	return fmt.Sprintf("%s#%s", storyID, chapterID)
}

func (d *DAO) GetChaptersByStoryID(ctx context.Context, storyID string) (chapters []models.Chapter, err error) {
	tableName := "chapters" + GetTableSuffix()

	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("story_id = :sid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
	}

	// Use paginator to handle results that span multiple pages
	paginator := dynamodb.NewScanPaginator(d.DynamoClient, scanInput)
	chapters = []models.Chapter{}

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}

		var pageChapters []models.Chapter
		if err = attributevalue.UnmarshalListOfMaps(page.Items, &pageChapters); err != nil {
			return nil, err
		}
		chapters = append(chapters, pageChapters...)
	}

	sort.Slice(chapters, func(i, j int) bool {
		return chapters[i].Place < chapters[j].Place
	})

	return chapters, nil
}

// GetChaptersByStoryIDs fetches chapters for multiple stories in a single query (batch operation)
// Returns a map of storyID -> chapters to avoid N+1 queries.
func (d *DAO) GetChaptersByStoryIDs(ctx context.Context, storyIDs []string) (map[string][]models.Chapter, error) {
	if len(storyIDs) == 0 {
		return make(map[string][]models.Chapter), nil
	}

	// Build filter expression with IN clause for story_id
	// FilterExpression: "story_id IN (:sid0, :sid1, :sid2, ...) AND attribute_not_exists(deleted_at)"
	filterExpr := "story_id IN ("
	expressionValues := make(map[string]types.AttributeValue)

	var filterExprSb81 strings.Builder
	for i, storyID := range storyIDs {
		placeholder := fmt.Sprintf(":sid%d", i)
		if i > 0 {
			filterExprSb81.WriteString(", ")
		}
		filterExprSb81.WriteString(placeholder)
		expressionValues[placeholder] = &types.AttributeValueMemberS{Value: storyID}
	}
	filterExpr += filterExprSb81.String()
	filterExpr += ") AND attribute_not_exists(deleted_at)"

	scanInput := &dynamodb.ScanInput{
		TableName:                 aws.String("chapters" + GetTableSuffix()),
		FilterExpression:          aws.String(filterExpr),
		ExpressionAttributeValues: expressionValues,
	}

	// Use paginator to handle results that span multiple pages
	paginator := dynamodb.NewScanPaginator(d.DynamoClient, scanInput)
	allChapters := []models.Chapter{}

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			logger.Error("Failed to batch fetch chapters", "error", err, "storyCount", len(storyIDs))
			return nil, err
		}

		var pageChapters []models.Chapter
		if err = attributevalue.UnmarshalListOfMaps(page.Items, &pageChapters); err != nil {
			logger.Error("Failed to unmarshal batch chapters", "error", err)
			return nil, err
		}
		allChapters = append(allChapters, pageChapters...)
	}

	// Group chapters by story_id
	chaptersByStory := make(map[string][]models.Chapter)
	for _, chapter := range allChapters {
		chaptersByStory[chapter.StoryID] = append(chaptersByStory[chapter.StoryID], chapter)
	}

	// Sort chapters within each story by place
	for storyID := range chaptersByStory {
		chapters := chaptersByStory[storyID]
		sort.Slice(chapters, func(i, j int) bool {
			return chapters[i].Place < chapters[j].Place
		})
		chaptersByStory[storyID] = chapters
	}

	return chaptersByStory, nil
}

// GetChapterTableStatus now always returns true since we use a unified table
// This maintains backwards compatibility with code checking table readiness.
func (d *DAO) GetChapterTableStatus(ctx context.Context, storyID, chapterID string) (bool, error) {
	// With unified table, chapters are always "ready"
	// Just verify the unified table exists
	_, err := d.DynamoClient.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: aws.String(GetStoryBlocksTableName()),
	})
	if err != nil {
		return false, err
	}
	return true, nil
}

func (d *DAO) GetChapterByID(ctx context.Context, chapterID string) (chapter *models.Chapter, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("chapter_id=:cid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cid": &types.AttributeValueMemberS{Value: chapterID},
		},
	}
	out, err := d.DynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return nil, err
	}

	chapterFromMap := []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &chapterFromMap); err != nil {
		return nil, err
	}
	if len(chapterFromMap) == 0 {
		return nil, errors.New("no chapter found")
	}
	return &chapterFromMap[0], nil
}

// GetChapterParagraphs queries the unified story_blocks table using composite key.
func (d *DAO) GetChapterParagraphs(
	ctx context.Context,
	storyID, chapterID string,
	startKey *map[string]types.AttributeValue,
) (*models.BlocksData, error) {
	var blocks models.BlocksData
	compositeKey := buildCompositeKey(storyID, chapterID)

	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(GetStoryBlocksTableName()),
		KeyConditionExpression: aws.String("composite_key = :pk AND place >= :zero"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":   &types.AttributeValueMemberS{Value: compositeKey},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	}

	if startKey != nil {
		queryInput.ExclusiveStartKey = *startKey
	}

	var items []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, queryInput)

	var lastKey map[string]types.AttributeValue
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			opErr := &smithy.OperationError{}
			if errors.As(err, &opErr) {
				var notFoundErr *types.ResourceNotFoundException
				if errors.As(opErr.Unwrap(), &notFoundErr) {
					return &blocks, err
				}
			}
			return &blocks, err
		}
		if page.LastEvaluatedKey != nil {
			lastKey = page.LastEvaluatedKey
		}
		items = append(items, page.Items...)
	}
	if len(items) == 0 {
		return nil, nil
	}
	blocks.Items = items
	blocks.LastEvaluated = lastKey
	return &blocks, nil
}

// CreateChapter no longer creates individual tables, just creates chapter metadata.
func (d *DAO) CreateChapter(
	ctx context.Context,
	storyID string,
	chapter models.Chapter,
	email string,
) (newChapter models.Chapter, err error) {
	newChapter = chapter
	var chapTwi types.TransactWriteItem
	if chapTwi, err = d.generateStoryChapterTransaction(storyID, chapter.ID, chapter.Title, chapter.Place); err != nil {
		return newChapter, err
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	twii.TransactItems = append(twii.TransactItems, chapTwi)
	awsErr, err := d.awsWriteTransaction(ctx, twii)
	if err != nil {
		return models.Chapter{}, err
	}
	if !awsErr.IsNil() {
		return models.Chapter{}, fmt.Errorf(
			"--AWSERROR-- Code:%s, Type: %s, Message: %s",
			awsErr.Code,
			awsErr.ErrorType,
			awsErr.Text,
		)
	}

	// No longer create individual chapter tables - unified table already exists
	return newChapter, nil
}

func (d *DAO) EditChapter(
	ctx context.Context,
	storyID string,
	chapter models.Chapter,
) (updatedChapter models.Chapter, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: storyID},
		"chapter_id":  &types.AttributeValueMemberS{Value: chapter.ID},
		"chapter_num": &types.AttributeValueMemberN{Value: strconv.Itoa(chapter.Place)},
		"title":       &types.AttributeValueMemberS{Value: chapter.Title},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	updatedChapter = chapter
	chapterUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("chapters" + GetTableSuffix()),
		Item:      item,
	}
	_, err = d.DynamoClient.PutItem(ctx, chapterUpdateInput)
	if err != nil {
		return updatedChapter, err
	}
	return updatedChapter, nil
}

// DeleteChapterParagraphs deletes paragraph items from unified table.
func (d *DAO) DeleteChapterParagraphs(
	ctx context.Context,
	storyID string,
	storyBlocks *models.StoryBlocks,
) (err error) {
	compositeKey := buildCompositeKey(storyID, storyBlocks.ChapterID)

	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += d.writeBatchSize {
		end := min(i+d.writeBatchSize, len(storyBlocks.Blocks))
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		// Deduplicate blocks by place to avoid "multiple operations on one item" error
		seenPlaces := make(map[int64]bool)
		var deleteItems []types.TransactWriteItem

		for _, item := range batch {
			// Parse place value to number
			placeNum, err := strconv.ParseInt(item.Place, 10, 64)
			if err != nil {
				return fmt.Errorf("invalid place value %s: %w", item.Place, err)
			}

			// Skip if we've already added a delete for this place in this batch
			if seenPlaces[placeNum] {
				logger.Warn("Skipping duplicate place value in delete batch",
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID,
					"place", placeNum,
					"keyId", item.KeyID)
				continue
			}
			seenPlaces[placeNum] = true

			// Create composite key for deletion
			key := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(placeNum, 10)},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String(GetStoryBlocksTableName()),
			}
			// Create a transaction write item for the delete operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			deleteItems = append(deleteItems, writeItem)
		}

		// Only execute transaction if we have items to delete
		if len(deleteItems) == 0 {
			continue
		}

		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      deleteItems,
		}

		awsErr, err := d.awsWriteTransaction(ctx, writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return err
}

// DeleteChapters deletes chapter metadata and all associated blocks.
func (d *DAO) DeleteChapters(ctx context.Context, storyID string, chapters []models.Chapter) (err error) {
	batches := make([][]models.Chapter, 0, (len(chapters)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(chapters); i += d.writeBatchSize {
		end := min(i+d.writeBatchSize, len(chapters))
		batches = append(batches, chapters[i:end])
	}

	// Loop through the chapters
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the chapter metadata.
			key := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: item.ID},
				"story_id":   &types.AttributeValueMemberS{Value: storyID},
			}

			// Create a delete input for the chapter metadata.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String("chapters" + GetTableSuffix()),
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem

			// Delete all blocks for this chapter from unified table
			// Note: This is done separately because transaction limit is 100 items
			go func(chID string) {
				compositeKey := buildCompositeKey(storyID, chID)
				if err := d.deleteAllBlocksForChapter(ctx, compositeKey); err != nil {
					// Log error but don't fail the transaction
					logger.Error("Failed to delete blocks for chapter",
						"error", err,
						"chapterId", chID,
						"storyId", storyID,
						"compositeKey", compositeKey)
				}
			}(item.ID)
		}

		awsErr, err := d.awsWriteTransaction(ctx, writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return err
}

// deleteAllBlocksForChapter is a helper to delete all blocks for a given chapter.
func (d *DAO) deleteAllBlocksForChapter(ctx context.Context, compositeKey string) error {
	// Query all blocks for this chapter
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(GetStoryBlocksTableName()),
		KeyConditionExpression: aws.String("composite_key = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: compositeKey},
		},
		ProjectionExpression: aws.String("composite_key, place"),
	}

	var itemsToDelete []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, queryInput)

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return err
		}
		itemsToDelete = append(itemsToDelete, page.Items...)
	}

	// Batch delete items using TransactWriteItems (max 100 items per call)
	for i := 0; i < len(itemsToDelete); i += 100 {
		end := min(
			//nolint:mnd
			i+100, len(itemsToDelete))
		batch := itemsToDelete[i:end]

		writeItems := make([]types.TransactWriteItem, len(batch))
		for j, item := range batch {
			writeItems[j] = types.TransactWriteItem{
				Delete: &types.Delete{
					TableName: aws.String(GetStoryBlocksTableName()),
					Key:       item,
				},
			}
		}

		_, err := d.DynamoClient.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{
			TransactItems: writeItems,
		})
		if err != nil {
			return err
		}
	}

	return nil
}

// GetBlockCountByChapter counts blocks in the unified table for a specific chapter.
func (d *DAO) GetBlockCountByChapter(ctx context.Context, email, storyID, chapterID string) (count int, err error) {
	compositeKey := buildCompositeKey(storyID, chapterID)

	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(GetStoryBlocksTableName()),
		KeyConditionExpression: aws.String("composite_key = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: compositeKey},
		},
		Select: types.SelectCount,
	}

	var totalCount int32
	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, queryInput)

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return 0, err
		}
		totalCount += page.Count
	}

	return int(totalCount), nil
}
