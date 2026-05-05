package daos

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Sentinel errors for series operations.
var (
	ErrSeriesNotFound = errors.New("series not found")
)

func (d *DAO) GetSeriesByID(ctx context.Context, email, seriesID string) (series *models.Series, err error) {
	seriesID, err = url.QueryUnescape(seriesID)
	if err != nil {
		return series, err
	}
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("series" + GetTableSuffix()),
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
		return series, ErrSeriesNotFound
	}
	seriesFromMap[0].Stories, err = d.GetSeriesVolumes(ctx, seriesID)
	if err != nil {
		return series, err
	}
	for _, story := range seriesFromMap[0].Stories {
		story.Chapters, err = d.GetChaptersByStoryID(ctx, story.ID)
		if err != nil {
			return series, err
		}
	}

	return &seriesFromMap[0], nil
}

func (d *DAO) GetAllSeriesWithStories(
	ctx context.Context,
	email string,
) (series []models.Series, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("series" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	scanOutput, err := d.DynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(scanOutput.Items, &series); err != nil {
		return nil, err
	}

	for i := range series {
		series[i].Stories, err = d.GetSeriesVolumes(ctx, series[i].ID)
		if err != nil {
			return nil, err
		}

		for j := range series[i].Stories {
			series[i].Stories[j].Chapters, err = d.GetChaptersByStoryID(ctx, series[i].Stories[j].ID)
			if err != nil {
				return nil, err
			}
		}
	}
	return series, nil
}

// GetAllSeriesIncludingDeleted fetches all soft-deleted series for a user (for restoration purposes)
// Note: This does NOT populate the Stories field for performance reasons during restoration.
func (d *DAO) GetAllSeriesIncludingDeleted(ctx context.Context, email string) (series []models.Series, err error) {
	logger.Debug("GetAllSeriesIncludingDeleted called", "email", email)

	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("series" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	scanOutput, err := d.DynamoClient.Scan(ctx, scanInput)
	if err != nil {
		logger.Error("Failed to scan series table for deleted series", "error", err, "email", email)
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(scanOutput.Items, &series); err != nil {
		logger.Error(
			"Failed to unmarshal deleted series",
			"error",
			err,
			"email",
			email,
			"itemCount",
			len(scanOutput.Items),
		)
		return nil, err
	}

	logger.Info("Found deleted series", "email", email, "count", len(series))
	return series, nil
}

func (d *DAO) GetSeriesVolumes(ctx context.Context, seriesID string) (volumes []*models.Story, err error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("stories" + GetTableSuffix()),
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
	if seriesOutput, err = d.DynamoClient.Query(ctx, queryInput); err != nil {
		return volumes, err
	}

	stories := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(seriesOutput.Items, &stories); err != nil {
		return volumes, err
	}

	for idx, story := range stories {
		chapters, err := d.GetChaptersByStoryID(ctx, story.ID)
		if err != nil {
			return nil, err
		}
		stories[idx].Chapters = chapters
		volumes = append(volumes, &stories[idx])
	}
	return volumes, nil
}

func (d *DAO) EditSeries(
	ctx context.Context,
	email string,
	series models.Series,
) (updatedSeries models.Series, err error) {
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
		_, err := d.GetStoryByID(ctx, email, story.ID)
		if err != nil {
			return updatedSeries, err
		}
		key := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories" + GetTableSuffix()),
			Key:              key,
			UpdateExpression: aws.String("set place = :p"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":p": &types.AttributeValueMemberN{Value: strconv.Itoa(story.Place)},
			},
		}
		_, err = d.DynamoClient.UpdateItem(ctx, storyUpdateInput)
		if err != nil {
			return updatedSeries, err
		}
	}

	seriesUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("series" + GetTableSuffix()),
		Item:      item,
	}
	_, err = d.DynamoClient.PutItem(ctx, seriesUpdateInput)
	if err != nil {
		return updatedSeries, err
	}
	return updatedSeries, nil
}

func (d *DAO) RemoveStoryFromSeries(
	ctx context.Context,
	email, storyID string,
	series models.Series,
) (updatedSeries models.Series, err error) {
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		Key:              storyKey,
		UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err = d.DynamoClient.UpdateItem(ctx, storyUpdateInput)
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
	return updatedSeries, err
}

func (d *DAO) DeleteSeries(ctx context.Context, email string, series models.Series) error {
	for _, story := range series.Stories {
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		now := strconv.FormatInt(time.Now().Unix(), 10)
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories" + GetTableSuffix()),
			Key:              storyKey,
			UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err := d.DynamoClient.UpdateItem(ctx, storyUpdateInput)
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
		TableName:        aws.String("series" + GetTableSuffix()),
		Key:              seriesKey,
		UpdateExpression: aws.String("set deleted_at = :n"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err := d.DynamoClient.UpdateItem(ctx, seriesUpdateInput)
	if err != nil {
		return err
	}

	return nil
}
