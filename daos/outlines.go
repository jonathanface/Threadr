package daos

import (
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) GetOutlineByStoryID(storyID string, chapters []models.Chapter) (*models.OutlineResponse, error) {
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
	assigned := make(map[string]struct{}, 64)
	var out models.OutlineResponse
	out.StoryID = storyID

	for _, item := range result.Items {
		if v, ok := item["backstory"]; ok {
			var bs string
			if err := attributevalue.Unmarshal(v, &bs); err != nil {
				return nil, fmt.Errorf("unmarshal backstory: %w", err)
			}
			out.Backstory = bs
		}
		var s models.OutlineSection

		if v, ok := item["place"].(*types.AttributeValueMemberN); ok {
			n, err := strconv.Atoi(v.Value)
			if err != nil {
				return nil, fmt.Errorf("error converting place to int: %w", err)
			}
			s.Place = n
		}
		if v, ok := item["header"].(*types.AttributeValueMemberS); ok {
			s.Header = v.Value
		}
		if v, ok := item["description"].(*types.AttributeValueMemberS); ok {
			s.Description = v.Value
		}
		if v, ok := item["text"].(*types.AttributeValueMemberS); ok {
			s.Text = v.Value
		}
		if v, ok := item["status"].(*types.AttributeValueMemberS); ok {
			s.Status = models.OutlineSectionStatus(v.Value)
		}
		if out.Template == "" {
			if v, ok := item["template"].(*types.AttributeValueMemberS); ok {
				out.Template = models.OutlineTemplate(v.Value)
			}
		}
		if v, ok := item["chapters"].(*types.AttributeValueMemberSS); ok {
			s.Chapters = v.Value
			for _, id := range v.Value {
				assigned[id] = struct{}{}
			}
		}

		out.Sections = append(out.Sections, s)
	}

	sort.Slice(out.Sections, func(i, j int) bool { return out.Sections[i].Place < out.Sections[j].Place })

	for _, ch := range chapters {
		if _, ok := assigned[ch.ID]; !ok {
			out.Unassigned = append(out.Unassigned, ch.ID) // or append(ch) if your API expects full objects
		}
	}

	return &out, nil
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

func (d *DAO) UpdateOutline(outline models.OutlineRequest) (*models.OutlineResponse, error) {
	tableName := "outlines" + GetTableSuffix()
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)

	for _, section := range outline.Sections {
		expressionValues := map[string]types.AttributeValue{
			":header":     &types.AttributeValueMemberS{Value: section.Header},
			":status":     &types.AttributeValueMemberS{Value: string(section.Status)},
			":text":       &types.AttributeValueMemberS{Value: section.Text},
			":updated_at": &types.AttributeValueMemberN{Value: now},
			":backstory":  &types.AttributeValueMemberS{Value: outline.Backstory},
		}

		updateExpression := "SET #text = :text, updated_at = :updated_at, header=:header, #status=:status, backstory=:backstory"
		expressionAttributeNames := map[string]string{
			"#text":   "text",
			"#status": "status",
		}

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
		return nil, err
	}
	if !awsErr.IsNil() {
		return nil, fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	allChapters, err := d.GetChaptersByStoryID(outline.StoryID)
	if err != nil {
		return nil, fmt.Errorf("refetch outline: %w", err)
	}
	resp, err := d.GetOutlineByStoryID(outline.StoryID, allChapters)
	if err != nil {
		return nil, fmt.Errorf("refetch outline: %w", err)
	}
	return resp, nil
}

func (d *DAO) CreateOutline(outline models.OutlineRequest) (*models.OutlineRequest, error) {
	twii := &dynamodb.TransactWriteItemsInput{}
	err := d.DeleteOutline(outline.StoryID)
	if err != nil {
		return nil, err
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	outline.Sections = GenerateStoryOutlineSections(outline.Template)
	for _, section := range outline.Sections {

		attributes := map[string]types.AttributeValue{
			"story_id":    &types.AttributeValueMemberS{Value: outline.StoryID},
			"place":       &types.AttributeValueMemberN{Value: strconv.Itoa(section.Place)},
			"type":        &types.AttributeValueMemberS{Value: string(outline.Template)},
			"header":      &types.AttributeValueMemberS{Value: section.Header},
			"description": &types.AttributeValueMemberS{Value: section.Description},
			"created_at":  &types.AttributeValueMemberN{Value: now},
			"backstory":   &types.AttributeValueMemberS{Value: outline.Backstory},
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
