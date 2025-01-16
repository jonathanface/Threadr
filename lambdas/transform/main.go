//build: GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap main.go
//zip: zip dataTransform.zip bootstrap

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/google/uuid"
)

type Event struct {
	TableName string `json:"tableName"`
}

// DraftJSParagraph represents the DraftJS data structure
type DraftJSParagraph struct {
	Key           string `json:"key"`
	Type          string `json:"type"`
	Text          string `json:"text"`
	CharacterList []struct {
		Style  []string `json:"style"`
		Entity *string  `json:"entity"`
	} `json:"characterList"`
	Depth int `json:"depth"`
	Data  struct {
		Alignment string `json:"ALIGNMENT"`
		Styles    []struct {
			Start int    `json:"start"`
			End   int    `json:"end"`
			Name  string `json:"name"`
		} `json:"STYLES"`
		EntityTabs []struct {
			Start int    `json:"start"`
			End   int    `json:"end"`
			Type  string `json:"type"`
		} `json:"ENTITY_TABS"`
	} `json:"data"`
}

type LexicalParagraph struct {
	Children []struct {
		Detail  int    `json:"detail"`
		Format  int    `json:"format"`
		Mode    string `json:"mode"`
		Style   string `json:"style"`
		Text    string `json:"text"`
		Type    string `json:"type"`
		Version int    `json:"version"`
	} `json:"children"`
	Direction  string `json:"direction"`
	Format     string `json:"format"`
	Indent     int    `json:"indent"`
	Type       string `json:"type"`
	Version    int    `json:"version"`
	TextFormat int    `json:"textFormat"`
	TextStyle  string `json:"textStyle"`
	KeyID      string `json:"key_id"`
}

// DynamoDBRecord represents a DynamoDB record
type DynamoDBRecord struct {
	KeyID   string `json:"key_id"`
	Chunk   string `json:"chunk"`
	Place   int    `json:"place,omitempty"`
	StoryID string `json:"story_id,omitempty"`
}

func deleteTableContents(svc *dynamodb.DynamoDB, tableName string) error {
	scanInput := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	}

	scanResult, err := svc.Scan(scanInput)
	if err != nil {
		return fmt.Errorf("failed to scan table %s: %v", tableName, err)
	}

	for _, item := range scanResult.Items {
		deleteInput := &dynamodb.DeleteItemInput{
			TableName: aws.String(tableName),
			Key: map[string]*dynamodb.AttributeValue{
				"key_id": item["key_id"],
			},
		}

		_, err = svc.DeleteItem(deleteInput)
		if err != nil {
			log.Printf("Failed to delete item: %v", err)
		}
	}

	log.Printf("All items deleted from table %s", tableName)
	return nil
}

func transformToLexical(draft DraftJSParagraph) LexicalParagraph {
	alignment := "left"

	if len(draft.Data.Alignment) > 0 {
		align := draft.Data.Alignment
		if align == "center" || align == "right" || align == "justify" {
			alignment = align
		}
	}

	transformedText := draft.Text
	if len(transformedText) >= 5 && transformedText[:5] == "     " {
		transformedText = "\t" + transformedText[5:]
	}

	// Build child nodes
	children := []struct {
		Detail  int    `json:"detail"`
		Format  int    `json:"format"`
		Mode    string `json:"mode"`
		Style   string `json:"style"`
		Text    string `json:"text"`
		Type    string `json:"type"`
		Version int    `json:"version"`
	}{}

	startIndex := 0
	for _, styleRange := range draft.Data.Styles {
		adjustedStart := styleRange.Start
		adjustedEnd := styleRange.End

		if adjustedStart > len(transformedText) {
			adjustedStart = len(transformedText)
		}
		if adjustedEnd > len(transformedText) {
			adjustedEnd = len(transformedText)
		}

		if adjustedStart > startIndex {
			children = append(children, struct {
				Detail  int    `json:"detail"`
				Format  int    `json:"format"`
				Mode    string `json:"mode"`
				Style   string `json:"style"`
				Text    string `json:"text"`
				Type    string `json:"type"`
				Version int    `json:"version"`
			}{
				Detail:  0,
				Format:  0,
				Mode:    "normal",
				Style:   "",
				Text:    transformedText[startIndex:adjustedStart],
				Type:    "text",
				Version: 1,
			})
		}

		format := 0
		switch styleRange.Name {
		case "italic":
			format |= 2
		case "bold":
			format |= 1
		case "underline":
			format |= 4
		}

		children = append(children, struct {
			Detail  int    `json:"detail"`
			Format  int    `json:"format"`
			Mode    string `json:"mode"`
			Style   string `json:"style"`
			Text    string `json:"text"`
			Type    string `json:"type"`
			Version int    `json:"version"`
		}{
			Detail:  0,
			Format:  format,
			Mode:    "normal",
			Style:   "",
			Text:    transformedText[adjustedStart:adjustedEnd],
			Type:    "text",
			Version: 1,
		})

		startIndex = adjustedEnd
	}

	if startIndex < len(transformedText) {
		children = append(children, struct {
			Detail  int    `json:"detail"`
			Format  int    `json:"format"`
			Mode    string `json:"mode"`
			Style   string `json:"style"`
			Text    string `json:"text"`
			Type    string `json:"type"`
			Version int    `json:"version"`
		}{
			Detail:  0,
			Format:  0,
			Mode:    "normal",
			Style:   "",
			Text:    transformedText[startIndex:],
			Type:    "text",
			Version: 1,
		})
	}

	// Ensure parent node includes children
	return LexicalParagraph{
		Children:  children,
		Direction: "ltr",
		Format:    alignment,
		Indent:    draft.Depth,
		Type:      "custom-paragraph",
		Version:   1,
		KeyID:     uuid.New().String(),
	}
}

func waitForTableToBecomeActive(svc *dynamodb.DynamoDB, tableName string) error {
	for {
		describeInput := &dynamodb.DescribeTableInput{
			TableName: aws.String(tableName),
		}

		result, err := svc.DescribeTable(describeInput)
		if err != nil {
			return fmt.Errorf("failed to describe table %s: %v", tableName, err)
		}

		if *result.Table.TableStatus == "ACTIVE" {
			log.Printf("Table %s is now ACTIVE", tableName)
			return nil
		}

		log.Printf("Waiting for table %s to become ACTIVE...", tableName)
		time.Sleep(5 * time.Second) // Wait before checking again
	}
}

func handler(ctx context.Context, event Event) (string, error) {
	if event.TableName == "" {
		return "", fmt.Errorf("tableName parameter is required")
	}

	sess := session.Must(session.NewSession())
	svc := dynamodb.New(sess)

	sourceTableName := event.TableName
	targetTableName := sourceTableName + "-rollout"

	// Describe source table
	describeInput := &dynamodb.DescribeTableInput{
		TableName: aws.String(sourceTableName),
	}
	sourceTableDesc, err := svc.DescribeTable(describeInput)
	if err != nil {
		return "", fmt.Errorf("failed to describe source table: %v", err)
	}

	// Check if the target table exists
	_, err = svc.DescribeTable(&dynamodb.DescribeTableInput{
		TableName: aws.String(targetTableName),
	})
	if err == nil {
		log.Printf("Target table %s already exists. Deleting contents...", targetTableName)
		err = deleteTableContents(svc, targetTableName)
		if err != nil {
			return "", fmt.Errorf("failed to delete contents of target table: %v", err)
		}
	} else {
		log.Printf("Target table %s does not exist. Creating table...", targetTableName)

		createInput := &dynamodb.CreateTableInput{
			TableName:            aws.String(targetTableName),
			KeySchema:            sourceTableDesc.Table.KeySchema,
			AttributeDefinitions: sourceTableDesc.Table.AttributeDefinitions,
			BillingMode:          sourceTableDesc.Table.BillingModeSummary.BillingMode,
		}

		if sourceTableDesc.Table.GlobalSecondaryIndexes != nil {
			for _, gsi := range sourceTableDesc.Table.GlobalSecondaryIndexes {
				createInput.GlobalSecondaryIndexes = append(createInput.GlobalSecondaryIndexes, &dynamodb.GlobalSecondaryIndex{
					IndexName:  gsi.IndexName,
					KeySchema:  gsi.KeySchema,
					Projection: gsi.Projection,
				})
			}
		}

		_, err := svc.CreateTable(createInput)
		if err != nil {
			return "", fmt.Errorf("failed to create target table: %v", err)
		}
		err = waitForTableToBecomeActive(svc, targetTableName)
		if err != nil {
			return "", fmt.Errorf("error while waiting for table %s to become ACTIVE: %v", targetTableName, err)
		}
		log.Printf("Successfully created target table: %s", targetTableName)
	}

	scanInput := &dynamodb.ScanInput{
		TableName: aws.String(sourceTableName),
	}

	scanResult, err := svc.Scan(scanInput)
	if err != nil {
		return "", fmt.Errorf("failed to scan source table: %v", err)
	}

	for _, item := range scanResult.Items {
		log.Printf("Processing record: %+v", item)
		var record DynamoDBRecord
		err = dynamodbattribute.UnmarshalMap(item, &record)
		if err != nil {
			log.Printf("Skipping record with invalid data: %v", err)
			continue
		}
		if record.Chunk == "" {
			log.Printf("Skipping record with missing data: %v", record.KeyID)
			continue
		}

		var draft DraftJSParagraph
		err = json.Unmarshal([]byte(record.Chunk), &draft)
		if err != nil {
			log.Printf("Skipping record with invalid JSON: %v", err)
			continue
		}

		lexical := transformToLexical(draft)
		lexicalData, err := json.Marshal(lexical)
		if err != nil {
			log.Printf("Failed to marshal Lexical data: %v", err)
			continue
		}

		putInput := &dynamodb.PutItemInput{
			TableName: aws.String(targetTableName),
			Item: map[string]*dynamodb.AttributeValue{
				"key_id": {
					S: aws.String(uuid.NewString()),
				},
				"chunk": {
					S: aws.String(string(lexicalData)),
				},
				"place": {
					N: aws.String(fmt.Sprintf("%d", record.Place)),
				},
				"story_id": {
					S: aws.String(record.StoryID),
				},
			},
		}

		_, err = svc.PutItem(putInput)
		if err != nil {
			log.Printf("Failed to write item to target table: %v", err)
		}
	}

	return fmt.Sprintf("Data transformed and stored in %s successfully", targetTableName), nil
}

func main() {
	lambda.Start(handler)
}
