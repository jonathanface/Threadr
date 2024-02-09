package daos

import (
	"RichDocter/models"
	"context"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) GetSeriesByID(email, seriesID string) (series *models.Series, err error) {
	seriesID, err = url.QueryUnescape(seriesID)
	if err != nil {
		return series, err
	}
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("series"),
		FilterExpression: aws.String("author=:eml AND series_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: seriesID},
		},
	})
	if err != nil {
		return series, err
	}

	seriesFromMap := []models.Series{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &seriesFromMap); err != nil {
		return series, err
	}
	if len(seriesFromMap) == 0 {
		return series, fmt.Errorf("no series found")
	}
	seriesFromMap[0].Stories, err = d.GetSeriesVolumes(email, seriesID)
	if err != nil {
		return series, err
	}
	for _, story := range seriesFromMap[0].Stories {
		story.Chapters, err = d.GetChaptersByStoryID(story.ID)
		if err != nil {
			return series, err
		}
	}

	return &seriesFromMap[0], nil
}

func (d *DAO) GetAllSeriesWithStories(email string, adminRequest bool) (series map[string][]models.Series, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("series"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	if adminRequest {
		scanInput = &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
		}
	}
	scanOutput, err := d.DynamoClient.Scan(context.TODO(), scanInput)
	if err != nil {
		return series, err
	}

	seriesMap := make(map[string][]models.Series)
	for _, item := range scanOutput.Items {
		if authorAttr, ok := item["author"]; ok {
			if authorStrAttr, ok := authorAttr.(*types.AttributeValueMemberS); ok {
				author := authorStrAttr.Value

				// Create a sub-map for the item's attributes
				itemMap := make(map[string]types.AttributeValue)
				for key, attr := range item {
					itemMap[key] = attr
				}

				// Map the author to the item's attributes
				var series models.Series
				if err = attributevalue.UnmarshalMap(itemMap, &series); err != nil {
					return nil, err
				}
				series.Stories, err = d.GetSeriesVolumes(email, series.ID)
				if err != nil {
					return nil, err
				}
				seriesMap[author] = append(seriesMap[author], series)
			}
		}
	}

	for author, seri := range seriesMap {
		for i, series := range seri {
			for s, story := range series.Stories {
				story.Chapters, err = d.GetChaptersByStoryID(story.ID)
				if err != nil {
					return nil, err
				}
				seriesMap[author][i].Stories[s] = story
			}
		}
	}
	return seriesMap, err
}

func (d *DAO) GetSeriesVolumes(email, seriesID string) (volumes []*models.Story, err error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("stories"),
		IndexName:              aws.String("series_id-place-index"),
		KeyConditionExpression: aws.String("series_id = :sid AND place > :p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":sid": &types.AttributeValueMemberS{
				Value: seriesID,
			},
		},
		FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
	}

	var seriesOutput *dynamodb.QueryOutput
	if seriesOutput, err = d.DynamoClient.Query(context.TODO(), queryInput); err != nil {
		return volumes, err
	}

	stories := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(seriesOutput.Items, &stories); err != nil {
		return volumes, err
	}

	for idx, story := range stories {
		chapters, err := d.GetChaptersByStoryID(story.ID)
		if err != nil {
			return nil, err
		}
		stories[idx].Chapters = chapters
		volumes = append(volumes, &stories[idx])
	}
	return volumes, nil
}

func (d *DAO) EditSeries(email string, series models.Series) (updatedSeries models.Series, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"series_id":   &types.AttributeValueMemberS{Value: series.ID},
		"title":       &types.AttributeValueMemberS{Value: series.Title},
		"author":      &types.AttributeValueMemberS{Value: email},
		"description": &types.AttributeValueMemberS{Value: series.Description},
		"image_url":   &types.AttributeValueMemberS{Value: series.ImageURL},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	updatedSeries = series

	for _, story := range series.Stories {
		// all we can change is the placement of stories
		_, err := d.GetStoryByID(email, story.ID)
		if err != nil {
			return updatedSeries, err
		}
		key := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              key,
			UpdateExpression: aws.String("set place = :p"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":p": &types.AttributeValueMemberN{Value: strconv.Itoa(story.Place)},
			},
		}
		_, err = d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return updatedSeries, err
		}
	}

	seriesUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("series"),
		Item:      item,
	}
	_, err = d.DynamoClient.PutItem(context.Background(), seriesUpdateInput)
	if err != nil {
		return updatedSeries, err
	}
	return updatedSeries, nil
}

func (d *DAO) RemoveStoryFromSeries(email, storyID string, series models.Series) (updatedSeries models.Series, err error) {

	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories"),
		Key:              storyKey,
		UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err = d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
	if err != nil {
		return updatedSeries, err
	}
	updatedSeries = series
	var newStories []*models.Story
	for _, seriesStory := range series.Stories {
		if seriesStory.ID != storyID {
			newStories = append(newStories, seriesStory)
		}
	}
	updatedSeries.Stories = newStories
	return
}

func (d *DAO) DeleteSeries(email string, series models.Series) error {

	for _, story := range series.Stories {
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		now := strconv.FormatInt(time.Now().Unix(), 10)
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              storyKey,
			UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err := d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return err
		}
	}
	seriesKey := map[string]types.AttributeValue{
		"series_id": &types.AttributeValueMemberS{Value: series.ID},
		"author":    &types.AttributeValueMemberS{Value: email},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	seriesUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("series"),
		Key:              seriesKey,
		UpdateExpression: aws.String("set deleted_at = :n"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err := d.DynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
	if err != nil {
		return err
	}

	return nil
}
