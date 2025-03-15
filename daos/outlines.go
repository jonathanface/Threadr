package daos

import (
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) GetOutlineByStoryID(storyID string) (*[]models.OutlineSection, error) {
	tableName := "outlines" + GetTableSuffix()

	// Define the query input
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		KeyConditionExpression: aws.String("story_id = :storyID"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":storyID": &types.AttributeValueMemberS{Value: storyID},
		},
	}

	// Execute the query
	result, err := d.DynamoClient.Query(context.TODO(), queryInput)
	if err != nil {
		return nil, fmt.Errorf("error querying outline sections: %v", err)
	}

	// Check if no results were found
	if len(result.Items) == 0 {
		return nil, sql.ErrNoRows
	}

	// Parse the response into OutlineSection models
	var outlineSections []models.OutlineSection
	for _, item := range result.Items {
		section := models.OutlineSection{}

		if v, ok := item["place"].(*types.AttributeValueMemberN); ok {
			placeInt, err := strconv.Atoi(v.Value)
			if err != nil {
				return nil, fmt.Errorf("error converting place to int: %v", err)
			}
			section.Place = placeInt
		}
		if v, ok := item["header"].(*types.AttributeValueMemberS); ok {
			section.Header = v.Value
		}
		if v, ok := item["description"].(*types.AttributeValueMemberS); ok {
			section.Description = v.Value
		}
		if v, ok := item["text"].(*types.AttributeValueMemberS); ok {
			section.Text = v.Value
		}
		if v, ok := item["chapters"].(*types.AttributeValueMemberSS); ok {
			section.Chapters = v.Value
		}
		outlineSections = append(outlineSections, section)
	}

	return &outlineSections, nil
}

func (d *DAO) DeleteOutline(storyID string) error {
	tableName := "outlines" + GetTableSuffix()
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		KeyConditionExpression: aws.String("story_id = :storyID"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":storyID": &types.AttributeValueMemberS{Value: storyID},
		},
	}

	result, err := d.DynamoClient.Query(context.TODO(), queryInput)
	if err != nil {
		return fmt.Errorf("error querying items: %v", err)
	}

	if len(result.Items) == 0 {
		fmt.Println("No items found for story_id:", storyID)
		return nil
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	for _, item := range result.Items {
		placeAttr, ok := item["place"].(*types.AttributeValueMemberN)
		if !ok {
			fmt.Println("Skipping item: missing or invalid 'place' value")
			continue
		}
		twi := types.TransactWriteItem{
			Delete: &types.Delete{
				TableName: &tableName,
				Key: map[string]types.AttributeValue{
					"story_id": &types.AttributeValueMemberS{Value: storyID},
					"place":    &types.AttributeValueMemberN{Value: placeAttr.Value},
				},
			},
		}
		twii.TransactItems = append(twii.TransactItems, twi)
	}

	awsErr, err := d.awsWriteTransaction(twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return err
}

func (d *DAO) UpdateOutline(outline models.OutlineRequest) error {
	tableName := "outlines" + GetTableSuffix()
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)

	for _, section := range outline.Sections {
		// ✅ Define base ExpressionAttributeValues
		expressionValues := map[string]types.AttributeValue{
			":text":       &types.AttributeValueMemberS{Value: section.Text},
			":updated_at": &types.AttributeValueMemberN{Value: now},
		}

		// ✅ UpdateExpression for normal updates
		updateExpression := "SET #text = :text, #updated_at = :updated_at"
		expressionAttributeNames := map[string]string{
			"#text":       "text",
			"#updated_at": "updated_at",
		}

		// ✅ Handle chapters: Update if non-empty, remove if empty
		if len(section.Chapters) > 0 {
			expressionValues[":chapters"] = &types.AttributeValueMemberSS{Value: section.Chapters}
			updateExpression += ", #chapters = :chapters"
			expressionAttributeNames["#chapters"] = "chapters"
		} else {
			// Instead of setting an empty SS (which causes an error), REMOVE the attribute
			updateExpression += " REMOVE #chapters"
			expressionAttributeNames["#chapters"] = "chapters"
		}

		twi := types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String(tableName),
				Key: map[string]types.AttributeValue{
					"story_id": &types.AttributeValueMemberS{Value: outline.StoryID},
					"place":    &types.AttributeValueMemberN{Value: strconv.Itoa(section.Place)},
				},
				UpdateExpression:          aws.String(updateExpression),
				ExpressionAttributeNames:  expressionAttributeNames,
				ExpressionAttributeValues: expressionValues, // ✅ Corrected map
			},
		}
		twii.TransactItems = append(twii.TransactItems, twi)
	}

	awsErr, err := d.awsWriteTransaction(twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) CreateOutline(outline models.OutlineRequest) (*models.OutlineRequest, error) {
	twii := &dynamodb.TransactWriteItemsInput{}
	err := d.DeleteOutline(outline.StoryID)
	if err != nil {
		return nil, err
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	outline.Sections = GenerateStoryOutlineSections(outline.Type)
	for _, section := range outline.Sections {

		attributes := map[string]types.AttributeValue{
			"story_id":    &types.AttributeValueMemberS{Value: outline.StoryID},
			"place":       &types.AttributeValueMemberN{Value: strconv.Itoa(section.Place)},
			"type":        &types.AttributeValueMemberS{Value: string(outline.Type)},
			"header":      &types.AttributeValueMemberS{Value: section.Header},
			"description": &types.AttributeValueMemberS{Value: section.Description},
			"created_at":  &types.AttributeValueMemberN{Value: now},
		}
		twi := types.TransactWriteItem{
			Put: &types.Put{
				TableName: aws.String("outlines" + GetTableSuffix()),
				Item:      attributes,
			},
		}
		twii.TransactItems = append(twii.TransactItems, twi)
	}

	awsErr, err := d.awsWriteTransaction(twii)
	if err != nil {
		return nil, err
	}
	if !awsErr.IsNil() {
		return nil, fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return &outline, nil
}
