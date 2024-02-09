package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

func (d *DAO) GetChaptersByStoryID(storyID string) (chapters []models.Chapter, err error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("story_id=:sid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		return nil, err
	}

	chapters = []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &chapters); err != nil {
		return nil, err
	}
	sort.Slice(chapters, func(i, j int) bool {
		return chapters[i].Place < chapters[j].Place
	})

	return chapters, nil
}

func (d *DAO) GetChapterByID(chapterID string) (chapter *models.Chapter, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("chapter_id=:cid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cid": &types.AttributeValueMemberS{Value: chapterID},
		},
	}
	out, err := d.DynamoClient.Scan(context.TODO(), scanInput)
	if err != nil {
		return nil, err
	}

	chapterFromMap := []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &chapterFromMap); err != nil {
		return nil, err
	}
	if len(chapterFromMap) == 0 {
		return nil, fmt.Errorf("no chapter found")
	}
	return &chapterFromMap[0], nil
}

func (d *DAO) GetChapterParagraphs(storyID, chapterID string, startKey *map[string]types.AttributeValue) (*models.BlocksData, error) {
	var blocks models.BlocksData
	tableName := storyID + "_" + chapterID + "_blocks"
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("story_id-place-index"),
		KeyConditionExpression: aws.String("#place>:p AND story_id=:sid"),
		ExpressionAttributeNames: map[string]string{
			"#place": "place",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":sid": &types.AttributeValueMemberS{
				Value: storyID,
			},
		},
	}

	if startKey != nil {
		queryInput.ExclusiveStartKey = *startKey
	}

	var items []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, queryInput)

	var lastKey map[string]types.AttributeValue
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			if opErr, ok := err.(*smithy.OperationError); ok {
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

func (d *DAO) CreateChapter(storyID string, chapter models.Chapter) (newChapter models.Chapter, err error) {
	newChapter = chapter
	var chapTwi types.TransactWriteItem
	if chapTwi, err = d.generateStoryChapterTransaction(storyID, chapter.ID, chapter.Title, chapter.Place); err != nil {
		return
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	twii.TransactItems = append(twii.TransactItems, chapTwi)
	err, awsErr := d.awsWriteTransaction(twii)
	if err != nil {
		return models.Chapter{}, err
	}
	if !awsErr.IsNil() {
		return models.Chapter{}, fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	tableName := storyID + "_" + chapter.ID + "_blocks"
	if err = d.createBlockTable(tableName); err != nil {
		return models.Chapter{}, err
	}
	return newChapter, nil
}

func (d *DAO) EditChapter(storyID string, chapter models.Chapter) (updatedChapter models.Chapter, err error) {
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
		TableName: aws.String("chapters"),
		Item:      item,
	}
	_, err = d.DynamoClient.PutItem(context.Background(), chapterUpdateInput)
	if err != nil {
		return updatedChapter, err
	}
	return updatedChapter, nil
}

func (d *DAO) DeleteChapterParagraphs(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks"

	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String(tableName),
			}
			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}

		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) DeleteChapters(storyID string, chapters []models.Chapter) (err error) {
	batches := make([][]models.Chapter, 0, (len(chapters)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(chapters); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(chapters) {
			end = len(chapters)
		}
		batches = append(batches, chapters[i:end])
	}
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: item.ID},
				"story_id":   &types.AttributeValueMemberS{Value: storyID},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String("chapters"),
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem

			tableName := storyID + "_" + item.ID + "_blocks"

			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(tableName),
			}

			// Delete the table
			if _, err = d.DynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
				return
			}
		}
		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) GetBlockCountByChapter(email, storyID, chapterID string) (count int, err error) {

	tableName := storyID + "_" + chapterID + "_blocks"

	blockScanInput := &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists('deleted_at')"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	blocksOut, err := d.DynamoClient.Scan(context.TODO(), blockScanInput)
	if err != nil {
		return
	}
	return len(blocksOut.Items), nil
}
