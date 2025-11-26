package daos

import (
	"RichDocter/logger"
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

func (d *DAO) GetAllStories(email string) (stories []*models.Story, err error) {
	logger.Debug("GetAllStories called", "email", email)

	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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

	for i := 0; i < len(stories); i++ {
		stories[i].Chapters, err = d.GetChaptersByStoryID(stories[i].ID)
		if err != nil {
			return nil, err
		}
	}
	return stories, nil
}

func (d *DAO) GetAllStandalone(email string, adminRequest bool) (stories []models.Story, err error) {
	input := &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(series_id) AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}

	out, err := d.DynamoClient.Scan(context.TODO(), input)
	if err != nil {
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return nil, err
	}

	for i := range stories {
		stories[i].Chapters, err = d.GetChaptersByStoryID(stories[i].ID)
		if err != nil {
			return nil, err
		}
	}

	sort.Slice(stories, func(i, j int) bool {
		return stories[i].CreatedAt < stories[j].CreatedAt
	})

	return stories, nil
}

func (d *DAO) GetStorySettingsByID(email, storyID string) (storySettings *models.StorySettings, err error) {
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
	out, err := d.DynamoClient.Scan(context.TODO(), scanInput)
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

func (d *DAO) GetStoryByID(email, storyID string) (story *models.Story, err error) {
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
	userDetails, err := d.GetUserDetails(email)
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
	out, err := d.DynamoClient.Scan(context.TODO(), scanInput)
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
	storyFromMap[0].Chapters, err = d.GetChaptersByStoryID(storyID)
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
		chapter, err := d.CreateChapter(storyID, chap, email)
		if err != nil {
			return story, err
		}
		storyFromMap[0].Chapters = append(storyFromMap[0].Chapters, chapter)
	}
	storyFromMap[0].Outline, err = d.GetOutlineByStoryID(storyID, storyFromMap[0].Chapters)
	if err != nil && err != sql.ErrNoRows {
		return &storyFromMap[0], err
	}
	return &storyFromMap[0], nil
}

// ResetBlockOrder reorders blocks by deleting and recreating them with new place values
// This is necessary because place is part of the primary key and cannot be updated
func (d *DAO) ResetBlockOrder(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	compositeKey := buildCompositeKey(storyID, storyBlocks.ChapterID)

	logger.Info("ResetBlockOrder started",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blockCount", len(storyBlocks.Blocks))

	// Step 1: Query all existing blocks to get their current data
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
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			logger.Error("Failed to query existing blocks",
				"error", err,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return err
		}
		existingItems = append(existingItems, page.Items...)
	}

	logger.Debug("Queried existing blocks",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"existingItemCount", len(existingItems))

	// Step 2: Create a map of key_id -> full item for quick lookup
	itemsByKeyID := make(map[string]map[string]types.AttributeValue)
	for _, item := range existingItems {
		if keyID, ok := item["key_id"].(*types.AttributeValueMemberS); ok {
			itemsByKeyID[keyID.Value] = item
		}
	}

	// Step 3: Delete all existing items and put them back with new place values
	// Each block requires 2 operations (delete + put), so batch size is half the transaction limit
	batchSize := d.writeBatchSize / 2
	if batchSize == 0 {
		batchSize = 50 // Default to 50 blocks (100 operations) if writeBatchSize is too small
	}
	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(batchSize-1))/batchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += batchSize {
		end := i + batchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Process in two phases to avoid conflicts:
	// Phase 1: Delete all existing blocks that are moving
	// Phase 2: Put all blocks at their new positions

	logger.Debug("Processing batches",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"batchCount", len(batches),
		"batchSize", batchSize)

	for batchIndex, batch := range batches {
		logger.Debug("Processing batch",
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"batchNumber", batchIndex+1,
			"totalBatches", len(batches),
			"itemsInBatch", len(batch))
		// Phase 1: Delete existing blocks that need to move
		deleteItems := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, 0, len(batch)),
		}

		// Phase 2: Put all blocks at their new positions
		putItems := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, 0, len(batch)),
		}

		for _, item := range batch {
			newPlaceNum, err := strconv.ParseInt(item.Place, 10, 64)
			if err != nil {
				return fmt.Errorf("invalid new place value %s: %w", item.Place, err)
			}

			// Check if this block exists in the database
			existingItem, exists := itemsByKeyID[item.KeyID]

			if exists {
				// Block exists - check if it needs to move

				// Get the old place value from the existing item
				oldPlace, ok := existingItem["place"].(*types.AttributeValueMemberN)
				if !ok {
					return fmt.Errorf("invalid place attribute for key_id %s", item.KeyID)
				}

				// Check if the place value is actually changing
				oldPlaceNum, _ := strconv.ParseInt(oldPlace.Value, 10, 64)
				if oldPlaceNum != newPlaceNum {
					// Delete the item from its old location
					deleteKey := map[string]types.AttributeValue{
						"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
						"place":         oldPlace,
					}
					deleteItems.TransactItems = append(deleteItems.TransactItems, types.TransactWriteItem{
						Delete: &types.Delete{
							TableName: aws.String(GetStoryBlocksTableName()),
							Key:       deleteKey,
						},
					})

					// Create new item with updated place value
					newItem := make(map[string]types.AttributeValue)
					for k, v := range existingItem {
						newItem[k] = v
					}
					newItem["place"] = &types.AttributeValueMemberN{Value: strconv.FormatInt(newPlaceNum, 10)}

					// Put the item at its new location
					putItems.TransactItems = append(putItems.TransactItems, types.TransactWriteItem{
						Put: &types.Put{
							TableName: aws.String(GetStoryBlocksTableName()),
							Item:      newItem,
						},
					})
				}
				// If place hasn't changed, skip this block entirely
			} else {
				// Block doesn't exist yet - just create it with the correct place value
				newItem := map[string]types.AttributeValue{
					"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
					"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(newPlaceNum, 10)},
					"story_id":      &types.AttributeValueMemberS{Value: storyID},
					"chapter_id":    &types.AttributeValueMemberS{Value: storyBlocks.ChapterID},
					"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
				}

				// Add chunk if provided
				if len(item.Chunk) > 0 {
					newItem["chunk"] = &types.AttributeValueMemberS{Value: string(item.Chunk)}
				}

				putItems.TransactItems = append(putItems.TransactItems, types.TransactWriteItem{
					Put: &types.Put{
						TableName: aws.String(GetStoryBlocksTableName()),
						Item:      newItem,
					},
				})
			}
		}

		// Execute Phase 1: Delete all items that are moving
		if len(deleteItems.TransactItems) > 0 {
			logger.Debug("Phase 1: Deleting blocks from old positions",
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID,
				"deleteCount", len(deleteItems.TransactItems))
			awsErr, err := d.awsWriteTransaction(deleteItems)
			if err != nil {
				logger.Error("Phase 1 delete transaction failed",
					"error", err,
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID)
				return err
			}
			if !awsErr.IsNil() {
				logger.Error("Phase 1 AWS error",
					"awsCode", awsErr.Code,
					"awsErrorType", awsErr.ErrorType,
					"awsText", awsErr.Text,
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID)
				return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
			}
		}

		// Execute Phase 2: Put all items at their new positions
		if len(putItems.TransactItems) > 0 {
			logger.Debug("Phase 2: Writing blocks to new positions",
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID,
				"putCount", len(putItems.TransactItems))
			awsErr, err := d.awsWriteTransaction(putItems)
			if err != nil {
				logger.Error("Phase 2 put transaction failed",
					"error", err,
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID)
				return err
			}
			if !awsErr.IsNil() {
				logger.Error("Phase 2 AWS error",
					"awsCode", awsErr.Code,
					"awsErrorType", awsErr.ErrorType,
					"awsText", awsErr.Text,
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID)
				return err
			}
			if !awsErr.IsNil() {
				return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
			}
		}
	}

	logger.Info("ResetBlockOrder completed successfully",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blocksProcessed", len(storyBlocks.Blocks))
	return
}

// WriteBlocks writes or updates blocks in the unified table
// It identifies blocks by key_id and handles moving them if their place changed
func (d *DAO) WriteBlocks(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	compositeKey := buildCompositeKey(storyID, storyBlocks.ChapterID)

	logger.Info("WriteBlocks started",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blockCount", len(storyBlocks.Blocks))

	// Step 1: Query existing blocks to find their current positions by key_id
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
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			logger.Error("Failed to query existing blocks",
				"error", err,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			return err
		}
		existingItems = append(existingItems, page.Items...)
	}

	logger.Debug("Queried existing blocks",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"existingItemCount", len(existingItems))

	// Create maps for lookups
	itemsByKeyID := make(map[string]map[string]types.AttributeValue)  // key_id -> item
	itemsByPlace := make(map[int64]map[string]types.AttributeValue)   // place -> item
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

	// Step 2: Process blocks in batches
	// Each block may need 2 operations (delete old + put new) so batch accordingly
	batchSize := d.writeBatchSize / 2
	if batchSize == 0 {
		batchSize = 50
	}
	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(batchSize-1))/batchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += batchSize {
		end := i + batchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	logger.Debug("Processing batches",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"batchCount", len(batches),
		"batchSize", batchSize)

	// Process in two phases like ResetBlockOrder
	for batchIndex, batch := range batches {
		logger.Debug("Processing batch",
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"batchNumber", batchIndex+1,
			"totalBatches", len(batches),
			"itemsInBatch", len(batch))
		deleteItems := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, 0, len(batch)),
		}
		putItems := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, 0, len(batch)),
		}

		for _, item := range batch {
			newPlaceNum, err := strconv.ParseInt(item.Place, 10, 64)
			if err != nil {
				return fmt.Errorf("invalid place value %s: %w", item.Place, err)
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
					"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(newPlaceNum, 10)},
					"story_id":      &types.AttributeValueMemberS{Value: storyID},
					"chapter_id":    &types.AttributeValueMemberS{Value: storyBlocks.ChapterID},
					"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
					"chunk":         &types.AttributeValueMemberS{Value: string(item.Chunk)},
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
					deleteItems.TransactItems = append(deleteItems.TransactItems, types.TransactWriteItem{
						Delete: &types.Delete{
							TableName: aws.String(GetStoryBlocksTableName()),
							Key:       deleteKey,
						},
					})
				}

				// Always put at the (potentially new) position with updated content
				putItems.TransactItems = append(putItems.TransactItems, types.TransactWriteItem{
					Put: &types.Put{
						TableName: aws.String(GetStoryBlocksTableName()),
						Item:      newItem,
					},
				})
			} else {
				// New block - check if the place is already occupied by another block
				actualPlace := newPlaceNum
				if _, placeOccupied := itemsByPlace[newPlaceNum]; placeOccupied {
					// There's already a different block at this place
					// Assign a temporary high place value to avoid conflicts
					// ResetBlockOrder will fix this later
					actualPlace = 1000000 + newPlaceNum
					logger.Warn("Place conflict detected for new block",
						"storyId", storyID,
						"chapterId", storyBlocks.ChapterID,
						"keyId", item.KeyID,
						"requestedPlace", newPlaceNum,
						"temporaryPlace", actualPlace)
				}

				// Create the new block (at temporary place if there was a conflict)
				newItem := map[string]types.AttributeValue{
					"composite_key": &types.AttributeValueMemberS{Value: compositeKey},
					"place":         &types.AttributeValueMemberN{Value: strconv.FormatInt(actualPlace, 10)},
					"story_id":      &types.AttributeValueMemberS{Value: storyID},
					"chapter_id":    &types.AttributeValueMemberS{Value: storyBlocks.ChapterID},
					"key_id":        &types.AttributeValueMemberS{Value: item.KeyID},
					"chunk":         &types.AttributeValueMemberS{Value: string(item.Chunk)},
				}

				putItems.TransactItems = append(putItems.TransactItems, types.TransactWriteItem{
					Put: &types.Put{
						TableName: aws.String(GetStoryBlocksTableName()),
						Item:      newItem,
					},
				})
			}
		}

		// Execute Phase 1: Delete
		if len(deleteItems.TransactItems) > 0 {
			logger.Debug("Phase 1: Deleting blocks from old positions",
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID,
				"deleteCount", len(deleteItems.TransactItems))
			awsErr, err := d.awsWriteTransaction(deleteItems)
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

		// Execute Phase 2: Put
		if len(putItems.TransactItems) > 0 {
			logger.Debug("Phase 2: Writing blocks to new positions",
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID,
				"putCount", len(putItems.TransactItems))
			awsErr, err := d.awsWriteTransaction(putItems)
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
	}

	logger.Info("WriteBlocks completed successfully",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blocksProcessed", len(storyBlocks.Blocks))
	return
}

func (d *DAO) EditStory(email string, story models.Story) (updatedStory models.Story, err error) {
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
	storedStory, err := d.GetStoryByID(email, story.ID)
	if err != nil {
		return updatedStory, err
	}
	if story.SeriesID != storedStory.SeriesID {
		// a change in series
		if story.SeriesID != "" {
			// check if this is a new or existing series
			series, err := d.GetSeriesByID(email, story.SeriesID)
			var seriesID string
			if err != nil {
				// TODO this is hack
				if err.Error() != "no series found" {
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
					_, err = d.DynamoClient.PutItem(context.Background(), seriesUpdateInput)
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
			_, err := d.GetSeriesByID(email, story.SeriesID)
			if err != nil {
				// TODO this is hack
				if err.Error() != "no series found" {
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
					_, err = d.DynamoClient.PutItem(context.Background(), seriesUpdateInput)
					if err != nil {
						return updatedStory, err
					}
				} else {
					// remove from series
					storedSeries, err := d.GetSeriesByID(email, storedStory.SeriesID)
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
					_, err = d.EditSeries(email, *storedSeries)
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
	_, err = d.DynamoClient.PutItem(context.Background(), storyUpdateInput)
	if err != nil {
		return updatedStory, err
	}
	return updatedStory, nil
}

func (d *DAO) UpdateStorySettings(email, storyID string, settings models.StorySettings) error {
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

	awsErr, err := d.awsWriteTransaction(twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) CreateStory(email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
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
	awsErr, err := d.awsWriteTransaction(twii)
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
		if resp, err = d.DynamoClient.Scan(context.TODO(), params); err != nil {
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
		awsErr, err = d.awsWriteTransaction(twii)
		if err != nil {
			return "", err
		}
		if !awsErr.IsNil() {
			return "", fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return story.ID, nil
}

func (d *DAO) GetStoryCountByUser(email string) (count int, err error) {
	storyScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	storyOut, err := d.DynamoClient.Scan(context.TODO(), storyScanInput)
	if err != nil {
		return
	}
	return len(storyOut.Items), nil
}
