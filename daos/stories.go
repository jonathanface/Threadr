package daos

import (
	"RichDocter/models"
	"context"
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
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return nil, err
	}

	// Sort stories by the created_at timestamp

	sort.Slice(stories, func(i, j int) bool {
		return stories[i].CreatedAt < stories[j].CreatedAt
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
	return &storyFromMap[0], nil
}

func (d *DAO) ResetBlockOrder(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks" + GetTableSuffix()
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
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
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

func (d *DAO) WriteBlocks(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks" + GetTableSuffix()
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
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set chunk=:c, story_id=:s, place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":c": &types.AttributeValueMemberS{Value: string(item.Chunk)},
					":s": &types.AttributeValueMemberS{Value: storyID},
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
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
	err, awsErr := d.awsWriteTransaction(twii)
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
		err, awsErr = d.awsWriteTransaction(twii)
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
