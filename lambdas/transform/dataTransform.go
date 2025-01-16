// this will live on lambda

package lambda

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/google/uuid"
)

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

type Request struct {
	TableName string `json:"tableName"`
}

type Response struct {
	Message string `json:"message"`
}

func transformToLexical(draft DraftJSParagraph) LexicalParagraph {
	// Default alignment to "left"
	alignment := "left"

	// Check if alignment exists and is valid
	if len(draft.Data.Alignment) > 0 {
		align := draft.Data.Alignment
		if align == "center" || align == "right" || align == "justify" {
			alignment = align
		}
	}

	// Replace leading five spaces with a tab character
	transformedText := draft.Text
	if len(transformedText) >= 5 && transformedText[:5] == "     " {
		transformedText = "\t" + transformedText[5:]
	}

	// Process styles
	children := []struct {
		Detail  int    `json:"detail"`
		Format  int    `json:"format"`
		Mode    string `json:"mode"`
		Style   string `json:"style"`
		Text    string `json:"text"`
		Type    string `json:"type"`
		Version int    `json:"version"`
	}{}

	// Break text into styled spans
	startIndex := 0
	for _, styleRange := range draft.Data.Styles {
		// Extract text before the styled range
		if styleRange.Start > startIndex {
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
				Text:    transformedText[startIndex:styleRange.Start],
				Type:    "text",
				Version: 1,
			})
		}

		// Extract and apply style to the current range
		format := 0
		for _, style := range draft.Data.Styles[styleRange.Start:styleRange.End] {
			switch style.Name {
			case "italic":
				format |= 1 // Example: Italic is 1
			case "bold":
				format |= 2 // Example: Bold is 2
			case "underline":
				format |= 4 // Example: Underline is 4
			}
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
			Text:    transformedText[styleRange.Start:styleRange.End],
			Type:    "text",
			Version: 1,
		})

		// Update the start index
		startIndex = styleRange.End
	}

	// Append any remaining text
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

	return LexicalParagraph{
		Children:   children,
		Direction:  "ltr",
		Format:     alignment, // Apply alignment here
		Indent:     draft.Depth,
		Type:       "custom-paragraph",
		Version:    1,
		TextFormat: 0,
		TextStyle:  "",
		KeyID:      uuid.New().String(),
	}
}

type DynamoDBRecord struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Event struct {
	TableName string `json:"tableName"`
}

func ensureTargetTableExists(svc *dynamodb.DynamoDB, originalTableName string, targetTableName string) error {
	// Check if the table already exists
	_, err := svc.DescribeTable(&dynamodb.DescribeTableInput{
		TableName: aws.String(targetTableName),
	})
	if err == nil {
		// Table already exists
		return nil
	}

	// Get the schema of the original table
	desc, err := svc.DescribeTable(&dynamodb.DescribeTableInput{
		TableName: aws.String(originalTableName),
	})
	if err != nil {
		return fmt.Errorf("failed to describe original table: %v", err)
	}

	// Create the new table with the same schema
	_, err = svc.CreateTable(&dynamodb.CreateTableInput{
		TableName:            aws.String(targetTableName),
		AttributeDefinitions: desc.Table.AttributeDefinitions,
		KeySchema:            desc.Table.KeySchema,
		ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
			ReadCapacityUnits:  desc.Table.ProvisionedThroughput.ReadCapacityUnits,
			WriteCapacityUnits: desc.Table.ProvisionedThroughput.WriteCapacityUnits,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create target table: %v", err)
	}

	return nil
}

// Handler function
func handler(ctx context.Context, event Event) (string, error) {
	if event.TableName == "" {
		return "", fmt.Errorf("tableName parameter is required")
	}

	sess := session.Must(session.NewSession())
	svc := dynamodb.New(sess)

	originalTableName := event.TableName
	targetTableName := fmt.Sprintf("%s-rollout", originalTableName)

	// Ensure the target table exists
	err := ensureTargetTableExists(svc, originalTableName, targetTableName)
	if err != nil {
		return "", err
	}

	// Scan the original table
	result, err := svc.Scan(&dynamodb.ScanInput{
		TableName: aws.String(originalTableName),
	})
	if err != nil {
		return "", fmt.Errorf("failed to scan table: %v", err)
	}

	// Transform and write to the new table
	for _, item := range result.Items {
		var record DynamoDBRecord
		err = dynamodbattribute.UnmarshalMap(item, &record)
		if err != nil {
			return "", fmt.Errorf("failed to unmarshal record: %v", err)
		}

		// Parse DraftJS data
		var draft DraftJSParagraph
		err = json.Unmarshal([]byte(record.Value), &draft)
		if err != nil {
			return "", fmt.Errorf("failed to unmarshal DraftJS data: %v", err)
		}

		// Transform to Lexical
		lexical := transformToLexical(draft)

		// Serialize Lexical data
		lexicalData, err := json.Marshal(lexical)
		if err != nil {
			return "", fmt.Errorf("failed to marshal Lexical data: %v", err)
		}

		// Write to the target table
		_, err = svc.PutItem(&dynamodb.PutItemInput{
			TableName: aws.String(targetTableName),
			Item: map[string]*dynamodb.AttributeValue{
				"key": {
					S: aws.String(record.Key),
				},
				"value": {
					S: aws.String(string(lexicalData)),
				},
			},
		})
		if err != nil {
			return "", fmt.Errorf("failed to write item to target table: %v", err)
		}
	}
	return "Data transformation and storage complete", nil
}
