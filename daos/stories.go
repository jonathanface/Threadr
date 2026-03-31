package daos

import (
	"Threadr/logger"
	"Threadr/models"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// truncateString truncates a string to maxLen characters, adding "..." if truncated
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func (d *DAO) GetAllStories(ctx context.Context, email string) (stories []*models.Story, err error) {
	logger.Debug("GetAllStories called", "email", email)

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("Failed to scan stories table", "error", err, "email", email)
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		logger.Error("Failed to unmarshal stories", "error", err, "email", email, "itemCount", len(out.Items))
		return nil, err
	}

	// Sort stories by the created_at timestamp

	sort.Slice(stories, func(i, j int) bool {
		if stories[i].CreatedAt == stories[j].CreatedAt {
			return stories[i].ID < stories[j].ID // tie-breaker
		}
		return stories[i].CreatedAt < stories[j].CreatedAt // oldest first
	})

	// Batch fetch chapters for all stories to avoid N+1 queries
	storyIDs := make([]string, len(stories))
	for i, story := range stories {
		storyIDs[i] = story.ID
	}

	chaptersByStory, err := d.GetChaptersByStoryIDs(ctx, storyIDs)
	if err != nil {
		logger.Error("Failed to batch fetch chapters for stories", "error", err, "storyCount", len(stories))
		return nil, err
	}

	// Assign chapters to each story
	for i := range stories {
		stories[i].Chapters = chaptersByStory[stories[i].ID]
	}

	return stories, nil
}

// GetAllStoriesIncludingDeleted fetches all soft-deleted stories for a user (for restoration purposes)
func (d *DAO) GetAllStoriesIncludingDeleted(ctx context.Context, email string) (stories []*models.Story, err error) {
	logger.Debug("GetAllStoriesIncludingDeleted called", "email", email)

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("Failed to scan stories table for deleted stories", "error", err, "email", email)
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		logger.Error("Failed to unmarshal deleted stories", "error", err, "email", email, "itemCount", len(out.Items))
		return nil, err
	}

	logger.Info("Found deleted stories", "email", email, "count", len(stories))
	return stories, nil
}

func (d *DAO) GetAllStandalone(ctx context.Context, email string, adminRequest bool) (stories []models.Story, err error) {
	input := &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(series_id) AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}

	out, err := d.DynamoClient.Scan(ctx, input)
	if err != nil {
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return nil, err
	}

	// Batch fetch chapters for all stories to avoid N+1 queries
	storyIDs := make([]string, len(stories))
	for i, story := range stories {
		storyIDs[i] = story.ID
	}

	chaptersByStory, err := d.GetChaptersByStoryIDs(ctx, storyIDs)
	if err != nil {
		logger.Error("Failed to batch fetch chapters for standalone stories", "error", err, "storyCount", len(stories))
		return nil, err
	}

	// Assign chapters to each story
	for i := range stories {
		stories[i].Chapters = chaptersByStory[stories[i].ID]
	}

	sort.Slice(stories, func(i, j int) bool {
		return stories[i].CreatedAt < stories[j].CreatedAt
	})

	return stories, nil
}

func (d *DAO) GetStorySettingsByID(ctx context.Context, email, storyID string) (storySettings *models.StorySettings, err error) {
	storyID, err = url.QueryUnescape(storyID)
	if err != nil {
		return storySettings, err
	}
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("story_settings" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND story_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyID},
		},
	}
	out, err := d.DynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return storySettings, err
	}

	storySettingsFromMap := []models.StorySettings{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &storySettingsFromMap); err != nil {
		return storySettings, err
	}
	if len(storySettingsFromMap) == 0 {
		return storySettings, sql.ErrNoRows
	}
	return &storySettingsFromMap[0], nil
}

func (d *DAO) GetStoryByID(ctx context.Context, email, storyID string) (story *models.Story, err error) {
	storyID, err = url.QueryUnescape(storyID)
	if err != nil {
		return story, err
	}
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND story_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyID},
		},
	}
	userDetails, err := d.GetUserDetails(ctx, email)
	if err != nil {
		return story, err
	}
	if userDetails.Admin {
		scanInput = &dynamodb.ScanInput{
			TableName:        aws.String("stories" + GetTableSuffix()),
			FilterExpression: aws.String("story_id=:s AND attribute_not_exists(deleted_at)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":s": &types.AttributeValueMemberS{Value: storyID},
			},
		}
	}
	out, err := d.DynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return story, err
	}

	storyFromMap := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &storyFromMap); err != nil {
		return story, err
	}
	if len(storyFromMap) == 0 {
		return story, fmt.Errorf("no story found")
	}
	storyFromMap[0].Chapters, err = d.GetChaptersByStoryID(ctx, storyID)
	if err != nil {
		return
	}
	if len(storyFromMap[0].Chapters) == 0 {
		// somehow there are no chapters for this story, so create one
		chap := models.Chapter{}
		chap.Place = 1
		chap.Title = "Chapter 1"
		chap.ID = uuid.New().String()
		chap.StoryID = storyID
		chapter, err := d.CreateChapter(ctx, storyID, chap, email)
		if err != nil {
			return story, err
		}
		storyFromMap[0].Chapters = append(storyFromMap[0].Chapters, chapter)
	}
	storyFromMap[0].Outline, err = d.GetOutlineByStoryID(ctx, storyID, storyFromMap[0].Chapters)
	if err != nil && err != sql.ErrNoRows {
		return &storyFromMap[0], err
	}
	return &storyFromMap[0], nil
}

// queryExistingBlocks queries all blocks for a chapter from the unified table
func (d *DAO) queryExistingBlocks(ctx context.Context, compositeKey, storyID, chapterID string) ([]map[string]types.AttributeValue, error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(GetStoryBlocksTableName()),
		KeyConditionExpression: aws.String("composite_key = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: compositeKey},
		},
	}

	var existingItems []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, queryInput)

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			logger.Error("Failed to query existing blocks",
				"error", err,
				"storyId", storyID,
				"chapterId", chapterID)
			return nil, err
		}
		existingItems = append(existingItems, page.Items...)
	}

	logger.Debug("Queried existing blocks",
		"storyId", storyID,
		"chapterId", chapterID,
		"existingItemCount", len(existingItems))

	return existingItems, nil
}

// buildItemMapByKeyID creates a map of key_id -> full item for quick lookup
func buildItemMapByKeyID(existingItems []map[string]types.AttributeValue) map[string]map[string]types.AttributeValue {
	itemsByKeyID := make(map[string]map[string]types.AttributeValue)
	for _, item := range existingItems {
		if keyID, ok := item["key_id"].(*types.AttributeValueMemberS); ok {
			itemsByKeyID[keyID.Value] = item
		}
	}
	return itemsByKeyID
}

// buildItemMaps creates both key_id and place lookup maps
func buildItemMaps(existingItems []map[string]types.AttributeValue) (
	itemsByKeyID map[string]map[string]types.AttributeValue,
	itemsByPlace map[int64]map[string]types.AttributeValue,
) {
	itemsByKeyID = make(map[string]map[string]types.AttributeValue)
	itemsByPlace = make(map[int64]map[string]types.AttributeValue)

	for _, item := range existingItems {
		if keyID, ok := item["key_id"].(*types.AttributeValueMemberS); ok {
			itemsByKeyID[keyID.Value] = item
			if place, ok := item["place"].(*types.AttributeValueMemberN); ok {
				if placeNum, err := strconv.ParseInt(place.Value, 10, 64); err == nil {
					itemsByPlace[placeNum] = item
				}
			}
		}
	}
	return itemsByKeyID, itemsByPlace
}

// createBatches splits blocks into batches based on batch size
func createBatches(blocks []models.StoryBlock, batchSize int) [][]models.StoryBlock {
	batches := make([][]models.StoryBlock, 0, (len(blocks)+(batchSize-1))/batchSize)
	for i := 0; i < len(blocks); i += batchSize {
		end := i + batchSize
		if end > len(blocks) {
			end = len(blocks)
		}
		batches = append(batches, blocks[i:end])
	}
	return batches
}

// buildReorderTransactions builds delete and put transaction items for block reordering
func buildReorderTransactions(
	batch []models.StoryBlock,
	compositeKey string,
	storyID string,
	chapterID string,
	itemsByKeyID map[string]map[string]types.AttributeValue,
) (deleteItems, putItems []types.TransactWriteItem, err error) {
	for _, item := range batch {
		newPlaceNum, err := strconv.ParseInt(item.Place, 10, 64)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid new place value %s: %w", item.Place, err)
		}

		existingItem, exists := itemsByKeyID[item.KeyID]

		if exists {
			// Block exists - check if it needs to move
			oldPlace, ok := existingItem["place"].(*types.AttributeValueMemberN)
			if !ok {
				return nil, nil, fmt.Errorf("invalid place attribute for key_id %s", item.KeyID)
			}

			oldPlaceNum, _ := strconv.ParseInt(oldPlace.Value, 10, 64)

			// Check if incoming has empty chunk but existing has content
			hasExistingChunk := false
			if existingChunk, ok := existingItem["chunk"]; ok {
				if s, ok := existingChunk.(*types.AttributeValueMemberS); ok && len(s.Value) > 10 {
					hasExistingChunk = true
				}
			}
			if hasExistingChunk && len(item.Chunk) == 0 {
				logger.Debug("ResetBlockOrder: Preserving existing chunk (incoming chunk is empty)",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"oldPlace", oldPlaceNum,
					"newPlace", newPlaceNum)
			}

			if oldPlaceNum != newPlaceNum {
				// Delete the item from its old location
				deleteKey := map[string]types.AttributeValue{
					"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
					"place":         oldPlace,
				}
				deleteItems = append(deleteItems, types.TransactWriteItem{
					Delete: &types.Delete{
						TableName: aws.String(GetStoryBlocksTableName()),
						Key:       deleteKey,
					},
				})

				// Create new item with updated place value
				// This preserves ALL attributes including chunk from existing item
				newItem := make(map[string]types.AttributeValue)
				for k, v := range existingItem {
					newItem[k] = v
				}
				newItem["place"] = &types.AttributeValueMemberN{Value: strconv.FormatInt(newPlaceNum, 10)}

				putItems = append(putItems, types.TransactWriteItem{
					Put: &types.Put{
						TableName: aws.String(GetStoryBlocksTableName()),
						Item:      newItem,
					},
				})
			}
		} else {
			// Block doesn't exist yet
			// WARNING: This should rarely happen in ResetBlockOrder (which is for reordering existing blocks)
			// If this happens frequently with empty chunks, it indicates a frontend bug
			if len(item.Chunk) == 0 {
				logger.Warn("ResetBlockOrder: Skipping creation of new block with empty chunk (possible frontend bug - sending wrong keyIDs)",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"place", item.Place)
				continue
			}

			logger.Debug("ResetBlockOrder: Creating new block",
				"storyId", storyID,
				"chapterId", chapterID,
				"keyId", item.KeyID,
				"place", item.Place)

			newItem := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(newPlaceNum, 10)},
				"story_id":      &types.AttributeValueMemberS{Value: storyID},
				"chapter_id":    &types.AttributeValueMemberS{Value: chapterID},
				"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
				"chunk":         &types.AttributeValueMemberS{Value: string(item.Chunk)},
			}

			putItems = append(putItems, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      newItem,
				},
			})
		}
	}
	return deleteItems, putItems, nil
}

// identifyOrphanedBlocks finds blocks that exist in DB but not in the new block list
func identifyOrphanedBlocks(
	itemsByKeyID map[string]map[string]types.AttributeValue,
	newBlocks []models.StoryBlock,
) []map[string]types.AttributeValue {
	newBlockKeyIDs := make(map[string]bool)
	for _, block := range newBlocks {
		newBlockKeyIDs[block.KeyID] = true
	}

	var blocksToDelete []map[string]types.AttributeValue
	for keyID, item := range itemsByKeyID {
		if !newBlockKeyIDs[keyID] {
			blocksToDelete = append(blocksToDelete, item)
		}
	}
	return blocksToDelete
}

// deleteOrphanedBlocks deletes blocks in batches using transactions
func (d *DAO) deleteOrphanedBlocks(
	ctx context.Context,
	blocksToDelete []map[string]types.AttributeValue,
	storyID string,
	chapterID string,
) error {
	deleteBatches := make([][]map[string]types.AttributeValue, 0, (len(blocksToDelete)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(blocksToDelete); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(blocksToDelete) {
			end = len(blocksToDelete)
		}
		deleteBatches = append(deleteBatches, blocksToDelete[i:end])
	}

	for _, batch := range deleteBatches {
		deleteInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}

		for i, item := range batch {
			deleteKey := map[string]types.AttributeValue{
				"composite_key": item["composite_key"],
				"place":         item["place"],
			}
			deleteInput.TransactItems[i] = types.TransactWriteItem{
				Delete: &types.Delete{
					TableName: aws.String(GetStoryBlocksTableName()),
					Key:       deleteKey,
				},
			}
		}

		awsErr, err := d.awsWriteTransaction(ctx, deleteInput)
		if err != nil {
			logger.Error("Phase 3 delete transaction failed",
				"error", err,
				"storyId", storyID,
				"chapterId", chapterID)
			return err
		}
		if !awsErr.IsNil() {
			logger.Error("Phase 3 AWS error",
				"awsCode", awsErr.Code,
				"awsErrorType", awsErr.ErrorType,
				"awsText", awsErr.Text,
				"storyId", storyID,
				"chapterId", chapterID)
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return nil
}

// ResetBlockOrder reorders blocks by deleting and recreating them with new place values
// This is necessary because place is part of the primary key and cannot be updated
// Note: This only changes block positions, NOT content
func (d *DAO) ResetBlockOrder(ctx context.Context, storyID string, blocksOrder *models.BlocksOrder) (err error) {
	compositeKey := buildCompositeKey(storyID, blocksOrder.ChapterID)

	logger.Info("ResetBlockOrder started",
		"storyId", storyID,
		"chapterId", blocksOrder.ChapterID,
		"blockCount", len(blocksOrder.Blocks))

	// Step 1: Query all existing blocks
	existingItems, err := d.queryExistingBlocks(ctx, compositeKey, storyID, blocksOrder.ChapterID)
	if err != nil {
		return err
	}

	// Step 2: Create lookup map by key_id
	itemsByKeyID := buildItemMapByKeyID(existingItems)

	// Step 3: Convert BlockOrder to StoryBlock (without chunk data - will be preserved from existing)
	blocks := make([]models.StoryBlock, len(blocksOrder.Blocks))
	for i, bo := range blocksOrder.Blocks {
		blocks[i] = models.StoryBlock{
			KeyID: bo.KeyID,
			Place: bo.Place,
			// Chunk intentionally omitted - will be preserved from existing blocks
		}
	}

	// Step 4: Process blocks in batches
	batchSize := d.writeBatchSize / 2
	if batchSize == 0 {
		batchSize = 50
	}
	batches := createBatches(blocks, batchSize)

	logger.Debug("Processing batches",
		"storyId", storyID,
		"chapterId", blocksOrder.ChapterID,
		"batchCount", len(batches),
		"batchSize", batchSize)

	// Process each batch in two phases: delete then put
	for batchIndex, batch := range batches {
		logger.Debug("Processing batch",
			"storyId", storyID,
			"chapterId", blocksOrder.ChapterID,
			"batchNumber", batchIndex+1,
			"totalBatches", len(batches),
			"itemsInBatch", len(batch))

		deleteItems, putItems, err := buildReorderTransactions(batch, compositeKey, storyID, blocksOrder.ChapterID, itemsByKeyID)
		if err != nil {
			return err
		}

		// Execute Phase 1: Delete all items that are moving
		if len(deleteItems) > 0 {
			logger.Debug("Phase 1: Deleting blocks from old positions",
				"storyId", storyID,
				"chapterId", blocksOrder.ChapterID,
				"deleteCount", len(deleteItems))

			deleteInput := &dynamodb.TransactWriteItemsInput{
				TransactItems: deleteItems,
			}
			awsErr, err := d.awsWriteTransaction(ctx, deleteInput)
			if err != nil {
				logger.Error("Phase 1 delete transaction failed",
					"error", err,
					"storyId", storyID,
					"chapterId", blocksOrder.ChapterID)
				return err
			}
			if !awsErr.IsNil() {
				logger.Error("Phase 1 AWS error",
					"awsCode", awsErr.Code,
					"awsErrorType", awsErr.ErrorType,
					"awsText", awsErr.Text,
					"storyId", storyID,
					"chapterId", blocksOrder.ChapterID)
				return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
			}
		}

		// Execute Phase 2: Put all items at their new positions
		if len(putItems) > 0 {
			logger.Debug("Phase 2: Writing blocks to new positions",
				"storyId", storyID,
				"chapterId", blocksOrder.ChapterID,
				"putCount", len(putItems))

			putInput := &dynamodb.TransactWriteItemsInput{
				TransactItems: putItems,
			}
			awsErr, err := d.awsWriteTransaction(ctx, putInput)
			if err != nil {
				logger.Error("Phase 2 put transaction failed",
					"error", err,
					"storyId", storyID,
					"chapterId", blocksOrder.ChapterID)
				return err
			}
			if !awsErr.IsNil() {
				logger.Error("Phase 2 AWS error",
					"awsCode", awsErr.Code,
					"awsErrorType", awsErr.ErrorType,
					"awsText", awsErr.Text,
					"storyId", storyID,
					"chapterId", blocksOrder.ChapterID)
				return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
			}
		}
	}

	// Phase 3: Delete blocks that exist in DB but aren't in the new order list
	blocksToDelete := identifyOrphanedBlocks(itemsByKeyID, blocks)
	if len(blocksToDelete) > 0 {
		logger.Info("Phase 3: Deleting blocks not in new order list",
			"storyId", storyID,
			"chapterId", blocksOrder.ChapterID,
			"deleteCount", len(blocksToDelete))

		if err := d.deleteOrphanedBlocks(ctx, blocksToDelete, storyID, blocksOrder.ChapterID); err != nil {
			return err
		}
	}

	logger.Info("ResetBlockOrder completed successfully",
		"storyId", storyID,
		"chapterId", blocksOrder.ChapterID,
		"blocksProcessed", len(blocks))
	return
}

// buildWriteTransactions builds delete and put transaction items for block writing
func buildWriteTransactions(
	batch []models.StoryBlock,
	compositeKey string,
	storyID string,
	chapterID string,
	itemsByKeyID map[string]map[string]types.AttributeValue,
	itemsByPlace map[int64]map[string]types.AttributeValue,
) (deleteItems, putItems []types.TransactWriteItem, err error) {
	// Track place values being used in this batch to detect conflicts
	batchPlaceUsage := make(map[int64]string) // place -> key_id

	for _, item := range batch {
		newPlaceNum, err := strconv.ParseInt(item.Place, 10, 64)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid place value %s: %w", item.Place, err)
		}

		existingItem, exists := itemsByKeyID[item.KeyID]

		if exists {
			// Block exists - check if place changed
			oldPlace, ok := existingItem["place"].(*types.AttributeValueMemberN)
			if !ok {
				return nil, nil, fmt.Errorf("invalid place attribute for key_id %s", item.KeyID)
			}

			oldPlaceNum, _ := strconv.ParseInt(oldPlace.Value, 10, 64)

			// Check for place conflicts within this batch
			actualPlace := newPlaceNum
			if conflictingKeyID, placeInUse := batchPlaceUsage[newPlaceNum]; placeInUse && conflictingKeyID != item.KeyID {
				// Another block in this batch is already using this place
				// Assign a temporary high place value to avoid transaction conflict
				actualPlace = 1000000 + newPlaceNum
				logger.Warn("Place conflict detected within batch for existing block",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"conflictingKeyId", conflictingKeyID,
					"requestedPlace", newPlaceNum,
					"temporaryPlace", actualPlace)
			} else {
				// Mark this place as used by this key_id
				batchPlaceUsage[newPlaceNum] = item.KeyID
			}

			// Build new item with updated content
			newItem := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(actualPlace, 10)},
				"story_id":      &types.AttributeValueMemberS{Value: storyID},
				"chapter_id":    &types.AttributeValueMemberS{Value: chapterID},
				"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
			}

			// Update chunk - with data loss protection
			if len(item.Chunk) > 0 {
				chunkStr := string(item.Chunk)

				// Check if we're overwriting content with empty data
				if existingChunk, ok := existingItem["chunk"]; ok {
					existingChunkStr := ""
					if s, ok := existingChunk.(*types.AttributeValueMemberS); ok {
						existingChunkStr = s.Value
					}

					// Detect potential data loss from malformed/broken chunks
					// A properly serialized Lexical paragraph (even empty) is ~100+ chars with structure
					// Malformed data from race conditions would be very short or literal empty values
					existingHasContent := len(existingChunkStr) > 50 // reasonable threshold for min Lexical JSON

					// Check for clearly malformed data (not properly serialized Lexical JSON)
					newIsMalformed := chunkStr == "null" ||
						chunkStr == "[]" ||
						chunkStr == `""` ||
						chunkStr == "{}" ||
						(len(chunkStr) < 30 && (!strings.Contains(chunkStr, "type") || !strings.Contains(chunkStr, "key_id"))) || // Short content must have structure
						(!strings.Contains(chunkStr, "type") && !strings.Contains(chunkStr, "key_id")) // Must have basic structure

					if existingHasContent && newIsMalformed {
						// PREVENT data loss by preserving existing content
						// This catches race conditions where malformed/broken data is sent
						// but allows properly serialized paragraphs (including intentionally empty ones) through
						logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk - incoming chunk is malformed",
							"storyId", storyID,
							"chapterId", chapterID,
							"keyId", item.KeyID,
							"existingLength", len(existingChunkStr),
							"incomingLength", len(chunkStr),
							"incomingChunk", chunkStr,
							"existingChunkPreview", truncateString(existingChunkStr, 100))
						// Preserve existing chunk instead of overwriting with malformed data
						newItem["chunk"] = existingChunk
					} else {
						// Safe update - accept the new chunk (including intentionally empty paragraphs)
						newItem["chunk"] = &types.AttributeValueMemberS{Value: chunkStr}
					}
				} else {
					// No existing chunk, accept the new one
					newItem["chunk"] = &types.AttributeValueMemberS{Value: chunkStr}
				}
			} else {
				// Zero-length chunk (likely a bug) - preserve existing to prevent data loss
				if existingChunk, ok := existingItem["chunk"]; ok {
					newItem["chunk"] = existingChunk
					logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk due to zero-length incoming chunk",
						"storyId", storyID,
						"chapterId", chapterID,
						"keyId", item.KeyID)
				}
			}

			// Preserve other attributes from existing item
			for k, v := range existingItem {
				if k != "composite_key" && k != "place" && k != "story_id" && k != "chapter_id" && k != "key_id" && k != "chunk" {
					newItem[k] = v
				}
			}

			if oldPlaceNum != newPlaceNum {
				// Place changed - need to delete from old position first
				deleteKey := map[string]types.AttributeValue{
					"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
					"place":         oldPlace,
				}
				deleteItems = append(deleteItems, types.TransactWriteItem{
					Delete: &types.Delete{
						TableName: aws.String(GetStoryBlocksTableName()),
						Key:       deleteKey,
					},
				})
			}

			// Always put at the (potentially new) position with updated content
			putItems = append(putItems, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      newItem,
				},
			})
		} else {
			// New block - skip only if chunk is truly zero-length (likely a bug)
			// Allow creation with valid empty JSON (intentional blank paragraphs)
			if len(item.Chunk) == 0 {
				logger.Warn("Skipping creation of new block with zero-length chunk (possible frontend bug)",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"place", item.Place)
				continue
			}

			// Check for place conflicts - both in database and within this batch
			actualPlace := newPlaceNum
			if conflictingKeyID, placeInUse := batchPlaceUsage[newPlaceNum]; placeInUse && conflictingKeyID != item.KeyID {
				// Another block in this batch is already using this place
				actualPlace = 1000000 + newPlaceNum
				logger.Warn("Place conflict detected within batch for new block",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"conflictingKeyId", conflictingKeyID,
					"requestedPlace", newPlaceNum,
					"temporaryPlace", actualPlace)
			} else if _, placeOccupied := itemsByPlace[newPlaceNum]; placeOccupied {
				// There's already a different block at this place in the database
				actualPlace = 1000000 + newPlaceNum
				logger.Warn("Place conflict detected for new block with existing database entry",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"requestedPlace", newPlaceNum,
					"temporaryPlace", actualPlace)
			} else {
				// Mark this place as used by this key_id
				batchPlaceUsage[newPlaceNum] = item.KeyID
			}

			newItem := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(actualPlace, 10)},
				"story_id":      &types.AttributeValueMemberS{Value: storyID},
				"chapter_id":    &types.AttributeValueMemberS{Value: chapterID},
				"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
				"chunk":         &types.AttributeValueMemberS{Value: string(item.Chunk)},
			}

			chunkStr := string(item.Chunk)
			if chunkStr == "null" || chunkStr == "[]" || chunkStr == `""` || chunkStr == "{}" {
				logger.Debug("Creating new block with intentional empty chunk",
					"storyId", storyID,
					"chapterId", chapterID,
					"keyId", item.KeyID,
					"chunkValue", chunkStr)
			}

			putItems = append(putItems, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      newItem,
				},
			})
		}
	}
	return deleteItems, putItems, nil
}

// WriteBlocks writes or updates blocks in the unified table
// It identifies blocks by key_id and handles moving them if their place changed
func (d *DAO) WriteBlocks(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) (err error) {
	compositeKey := buildCompositeKey(storyID, storyBlocks.ChapterID)

	logger.Info("WriteBlocks started",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blockCount", len(storyBlocks.Blocks))

	// Step 1: Query existing blocks
	existingItems, err := d.queryExistingBlocks(ctx, compositeKey, storyID, storyBlocks.ChapterID)
	if err != nil {
		return err
	}

	// Step 2: Create lookup maps
	itemsByKeyID, _ := buildItemMaps(existingItems)

	// Step 3: Build all delete and put transactions from the full block list.
	// We process all blocks at once (no batching at this stage) so that
	// place assignments are computed with full knowledge of all moves.
	// The itemsByPlace conflict check is not needed here because we execute
	// ALL deletes before ANY puts, guaranteeing old positions are cleared first.
	var allDeleteItems []types.TransactWriteItem
	var allPutItems []types.TransactWriteItem

	for _, item := range storyBlocks.Blocks {
		newPlaceNum, parseErr := strconv.ParseInt(item.Place, 10, 64)
		if parseErr != nil {
			return fmt.Errorf("invalid place value %s: %w", item.Place, parseErr)
		}

		existingItem, exists := itemsByKeyID[item.KeyID]

		if exists {
			// Block exists - check if place changed
			oldPlace, ok := existingItem["place"].(*types.AttributeValueMemberN)
			if !ok {
				return fmt.Errorf("invalid place attribute for key_id %s", item.KeyID)
			}

			oldPlaceNum, _ := strconv.ParseInt(oldPlace.Value, 10, 64)

			// Build new item with updated content
			newItem := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: item.Place},
				"story_id":      &types.AttributeValueMemberS{Value: storyID},
				"chapter_id":    &types.AttributeValueMemberS{Value: storyBlocks.ChapterID},
				"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
			}

			// Update chunk - with data loss protection
			if len(item.Chunk) > 0 {
				chunkStr := string(item.Chunk)

				if existingChunk, ok := existingItem["chunk"]; ok {
					existingChunkStr := ""
					if s, ok := existingChunk.(*types.AttributeValueMemberS); ok {
						existingChunkStr = s.Value
					}

					existingHasContent := len(existingChunkStr) > 50

					newIsMalformed := chunkStr == "null" ||
						chunkStr == "[]" ||
						chunkStr == `""` ||
						chunkStr == "{}" ||
						(len(chunkStr) < 30 && (!strings.Contains(chunkStr, "type") || !strings.Contains(chunkStr, "key_id"))) ||
						(!strings.Contains(chunkStr, "type") && !strings.Contains(chunkStr, "key_id"))

					if existingHasContent && newIsMalformed {
						logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk - incoming chunk is malformed",
							"storyId", storyID,
							"chapterId", storyBlocks.ChapterID,
							"keyId", item.KeyID,
							"existingLength", len(existingChunkStr),
							"incomingLength", len(chunkStr),
							"incomingChunk", chunkStr,
							"existingChunkPreview", truncateString(existingChunkStr, 100))
						newItem["chunk"] = existingChunk
					} else {
						newItem["chunk"] = &types.AttributeValueMemberS{Value: chunkStr}
					}
				} else {
					newItem["chunk"] = &types.AttributeValueMemberS{Value: chunkStr}
				}
			} else {
				if existingChunk, ok := existingItem["chunk"]; ok {
					newItem["chunk"] = existingChunk
					logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk due to zero-length incoming chunk",
						"storyId", storyID,
						"chapterId", storyBlocks.ChapterID,
						"keyId", item.KeyID)
				}
			}

			// Preserve other attributes from existing item
			for k, v := range existingItem {
				if k != "composite_key" && k != "place" && k != "story_id" && k != "chapter_id" && k != "key_id" && k != "chunk" {
					newItem[k] = v
				}
			}

			if oldPlaceNum != newPlaceNum {
				// Place changed - need to delete from old position first
				deleteKey := map[string]types.AttributeValue{
					"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
					"place":         oldPlace,
				}
				allDeleteItems = append(allDeleteItems, types.TransactWriteItem{
					Delete: &types.Delete{
						TableName: aws.String(GetStoryBlocksTableName()),
						Key:       deleteKey,
					},
				})
			}

			allPutItems = append(allPutItems, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      newItem,
				},
			})
		} else {
			// New block
			if len(item.Chunk) == 0 {
				logger.Warn("Skipping creation of new block with zero-length chunk (possible frontend bug)",
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID,
					"keyId", item.KeyID,
					"place", item.Place)
				continue
			}

			newItem := map[string]types.AttributeValue{
				"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
				"place":         &types.AttributeValueMemberN{Value: item.Place},
				"story_id":      &types.AttributeValueMemberS{Value: storyID},
				"chapter_id":    &types.AttributeValueMemberS{Value: storyBlocks.ChapterID},
				"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
				"chunk":         &types.AttributeValueMemberS{Value: string(item.Chunk)},
			}

			allPutItems = append(allPutItems, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      newItem,
				},
			})
		}
	}

	// Step 4: Execute all deletes first (in batches), then all puts.
	// This guarantees old positions are cleared before new positions are written,
	// eliminating place conflicts entirely.
	txnBatchSize := d.writeBatchSize
	if txnBatchSize == 0 {
		txnBatchSize = 100
	}

	// Phase 1: Execute all deletes
	for i := 0; i < len(allDeleteItems); i += txnBatchSize {
		end := i + txnBatchSize
		if end > len(allDeleteItems) {
			end = len(allDeleteItems)
		}
		batch := allDeleteItems[i:end]

		logger.Debug("Phase 1: Deleting blocks from old positions",
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"deleteCount", len(batch),
			"batchStart", i,
			"totalDeletes", len(allDeleteItems))

		deleteInput := &dynamodb.TransactWriteItemsInput{
			TransactItems: batch,
		}
		awsErr, err := d.awsWriteTransaction(ctx, deleteInput)
		if err != nil {
			logger.Error("Phase 1 delete transaction failed",
				"error", err,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return err
		}
		if !awsErr.IsNil() {
			logger.Error("Phase 1 delete AWS error",
				"awsCode", awsErr.Code,
				"awsErrorType", awsErr.ErrorType,
				"awsMessage", awsErr.Text,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}

	// Phase 2: Execute all puts
	for i := 0; i < len(allPutItems); i += txnBatchSize {
		end := i + txnBatchSize
		if end > len(allPutItems) {
			end = len(allPutItems)
		}
		batch := allPutItems[i:end]

		logger.Debug("Phase 2: Writing blocks to new positions",
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"putCount", len(batch),
			"batchStart", i,
			"totalPuts", len(allPutItems))

		putInput := &dynamodb.TransactWriteItemsInput{
			TransactItems: batch,
		}
		awsErr, err := d.awsWriteTransaction(ctx, putInput)
		if err != nil {
			logger.Error("Phase 2 put transaction failed",
				"error", err,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return err
		}
		if !awsErr.IsNil() {
			logger.Error("Phase 2 put AWS error",
				"awsCode", awsErr.Code,
				"awsErrorType", awsErr.ErrorType,
				"awsMessage", awsErr.Text,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}

	logger.Info("WriteBlocks completed successfully",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blocksProcessed", len(storyBlocks.Blocks))
	return
}

func (d *DAO) EditStory(ctx context.Context, email string, story models.Story) (updatedStory models.Story, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: story.ID},
		"title":       &types.AttributeValueMemberS{Value: story.Title},
		"author":      &types.AttributeValueMemberS{Value: email},
		"description": &types.AttributeValueMemberS{Value: story.Description},
		"image_url":   &types.AttributeValueMemberS{Value: story.ImageURL},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	if story.SeriesID != "" {
		intPlace := strconv.Itoa(story.Place)
		item["series_id"] = &types.AttributeValueMemberS{Value: story.SeriesID}
		item["place"] = &types.AttributeValueMemberN{Value: intPlace}
	}
	updatedStory = story
	storedStory, err := d.GetStoryByID(ctx, email, story.ID)
	if err != nil {
		return updatedStory, err
	}
	if story.SeriesID != storedStory.SeriesID {
		// a change in series
		if story.SeriesID != "" {
			// check if this is a new or existing series
			series, err := d.GetSeriesByID(ctx, email, story.SeriesID)
			var seriesID string
			if err != nil {
				if !errors.Is(err, ErrSeriesNotFound) {
					return updatedStory, err
				} else {
					updatedStory.Place = 1
					seriesID = uuid.New().String()
					seriesItem := map[string]types.AttributeValue{
						"series_id": &types.AttributeValueMemberS{Value: seriesID},
						"title":     &types.AttributeValueMemberS{Value: story.SeriesID},
						"author":    &types.AttributeValueMemberS{Value: email},
					}
					seriesUpdateInput := &dynamodb.PutItemInput{
						TableName: aws.String("series" + GetTableSuffix()),
						Item:      seriesItem,
					}
					_, err = d.DynamoClient.PutItem(ctx, seriesUpdateInput)
					if err != nil {
						return updatedStory, err
					}
				}
			} else {
				seriesID = series.ID

				if len(series.Stories) > 1 {
					sort.Slice(series.Stories, func(i, j int) bool {
						return series.Stories[i].Place > series.Stories[j].Place
					})
				} else if len(series.Stories) == 1 {
					updatedStory.Place = series.Stories[0].Place + 1
				}
			}
			item["series_id"] = &types.AttributeValueMemberS{Value: seriesID}
			item["place"] = &types.AttributeValueMemberN{Value: strconv.Itoa(updatedStory.Place)}
			updatedStory.SeriesID = seriesID
		} else {
			// story was removed from series OR new series
			_, err := d.GetSeriesByID(ctx, email, story.SeriesID)
			if err != nil {
				if !errors.Is(err, ErrSeriesNotFound) {
					return updatedStory, err
				} else if story.SeriesID != "" {
					// new series
					updatedStory.Place = 1
					seriesID := uuid.New().String()
					seriesItem := map[string]types.AttributeValue{
						"series_id": &types.AttributeValueMemberS{Value: seriesID},
						"title":     &types.AttributeValueMemberS{Value: story.SeriesID},
						"author":    &types.AttributeValueMemberS{Value: email},
					}
					seriesUpdateInput := &dynamodb.PutItemInput{
						TableName: aws.String("series" + GetTableSuffix()),
						Item:      seriesItem,
					}
					_, err = d.DynamoClient.PutItem(ctx, seriesUpdateInput)
					if err != nil {
						return updatedStory, err
					}
				} else {
					// remove from series
					storedSeries, err := d.GetSeriesByID(ctx, email, storedStory.SeriesID)
					if err != nil {
						return updatedStory, err
					}
					var newStories []*models.Story
					for _, seriesStory := range storedSeries.Stories {
						if seriesStory.ID != updatedStory.ID {
							newStories = append(newStories, seriesStory)
						}
					}
					storedSeries.Stories = newStories
					_, err = d.EditSeries(ctx, email, *storedSeries)
					if err != nil {
						return updatedStory, err
					}
				}
				updatedStory.Place = 0
			}
		}
	}

	storyUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Item:      item,
	}
	_, err = d.DynamoClient.PutItem(ctx, storyUpdateInput)
	if err != nil {
		return updatedStory, err
	}
	return updatedStory, nil
}

func (d *DAO) UpdateStorySettings(ctx context.Context, email, storyID string, settings models.StorySettings) error {
	tableName := "story_settings" + GetTableSuffix()
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)

	expressionValues := map[string]types.AttributeValue{
		":autotab":    &types.AttributeValueMemberBOOL{Value: settings.Autotab},
		":spellcheck": &types.AttributeValueMemberBOOL{Value: settings.Spellcheck},
		":updated_at": &types.AttributeValueMemberN{Value: now},
	}

	updateExpression := "SET #spellcheck = :spellcheck, autotab=:autotab, #updated_at = :updated_at"
	expressionAttributeNames := map[string]string{
		"#spellcheck": "spellcheck",
		"#updated_at": "updated_at",
	}

	twi := types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String(tableName),
			Key: map[string]types.AttributeValue{
				"story_id": &types.AttributeValueMemberS{Value: storyID},
				"author":   &types.AttributeValueMemberS{Value: email},
			},
			UpdateExpression:          aws.String(updateExpression),
			ExpressionAttributeNames:  expressionAttributeNames,
			ExpressionAttributeValues: expressionValues,
		},
	}
	twii.TransactItems = append(twii.TransactItems, twi)

	awsErr, err := d.awsWriteTransaction(ctx, twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) CreateStory(ctx context.Context, email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	attributes := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: story.ID},
		"author":      &types.AttributeValueMemberS{Value: email},
		"title":       &types.AttributeValueMemberS{Value: story.Title},
		"description": &types.AttributeValueMemberS{Value: story.Description},
		"created_at":  &types.AttributeValueMemberN{Value: now},
		"image_url":   &types.AttributeValueMemberS{Value: story.ImageURL},
	}

	if story.SeriesID != "" {
		intPlace := strconv.Itoa(story.Place)
		attributes["series_id"] = &types.AttributeValueMemberS{Value: story.SeriesID}
		attributes["place"] = &types.AttributeValueMemberN{Value: intPlace}
	}
	twi := types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("stories" + GetTableSuffix()),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(story_id)"),
		},
	}

	twii.TransactItems = append(twii.TransactItems, twi)
	awsErr, err := d.awsWriteTransaction(ctx, twii)
	if err != nil {
		return "", err
	}
	if !awsErr.IsNil() {
		return "", fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	if story.SeriesID != "" {
		twii = &dynamodb.TransactWriteItemsInput{}
		params := &dynamodb.ScanInput{
			TableName:        aws.String("series" + GetTableSuffix()),
			FilterExpression: aws.String("series_id=:sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: story.SeriesID},
			},
			Select: types.SelectCount,
		}

		// Execute the scan operation and get the count
		var resp *dynamodb.ScanOutput
		if resp, err = d.DynamoClient.Scan(ctx, params); err != nil {
			return
		}

		if resp.Count == 0 {
			attributes := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: story.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
				"title":     &types.AttributeValueMemberS{Value: newSeriesTitle},
				"image_url": &types.AttributeValueMemberS{Value: DEFAULT_SERIES_IMAGE_URL},
			}
			seriesTwi := types.TransactWriteItem{
				Put: &types.Put{
					TableName:           aws.String("series" + GetTableSuffix()),
					Item:                attributes,
					ConditionExpression: aws.String("attribute_not_exists(series_id)"),
				},
			}
			twii.TransactItems = append(twii.TransactItems, seriesTwi)
			resp.Count++
		}

		updateStoryTwi := types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String("stories" + GetTableSuffix()),
				Key: map[string]types.AttributeValue{
					"story_id": &types.AttributeValueMemberS{Value: story.ID},
					"author":   &types.AttributeValueMemberS{Value: email},
				},
				UpdateExpression: aws.String("set place=:p, series_id=:sid"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":p":   &types.AttributeValueMemberN{Value: strconv.Itoa(int(resp.Count))},
					":sid": &types.AttributeValueMemberS{Value: story.SeriesID},
				},
			},
		}
		twii.TransactItems = append(twii.TransactItems, updateStoryTwi)
		awsErr, err = d.awsWriteTransaction(ctx, twii)
		if err != nil {
			return "", err
		}
		if !awsErr.IsNil() {
			return "", fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return story.ID, nil
}

func (d *DAO) GetStoryCountByUser(ctx context.Context, email string) (count int, err error) {
	storyScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	storyOut, err := d.DynamoClient.Scan(ctx, storyScanInput)
	if err != nil {
		return
	}
	return len(storyOut.Items), nil
}
