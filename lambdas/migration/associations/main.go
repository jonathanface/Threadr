// build: GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap main.go
// zip: zip dataTransform.zip bootstrap

package main

import (
	"context"
	"fmt"
	"log"

	"github.com/aws/aws-lambda-go/lambda"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynatypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	AssociationDetailsTable = "association_details"
	AssociationsTable       = "associations"
)

// awsString returns a pointer to a string literal.
func awsString(s string) *string {
	return &s
}

func handler(ctx context.Context) (string, error) {
	// Load configuration
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to load configuration: %w", err)
	}

	// Create DynamoDB client
	dynamoClient := dynamodb.NewFromConfig(cfg)

	// Scan the association_details table.
	scanInput := &dynamodb.ScanInput{
		TableName: awsString(AssociationDetailsTable),
		// Optionally, you can limit attributes with ProjectionExpression:
		// ProjectionExpression: awsString("association_id, story_or_series_id, aliases, case_sensitive"),
	}
	scanOutput, err := dynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return "", fmt.Errorf("failed to scan %s table: %w", AssociationDetailsTable, err)
	}

	for _, item := range scanOutput.Items {
		// Extract the association_id.
		assocIDAttr, ok := item["association_id"]
		if !ok {
			log.Printf("Skipping item with no association_id: %v", item)
			continue
		}
		associationID, ok := assocIDAttr.(*dynatypes.AttributeValueMemberS)
		if !ok {
			log.Printf("association_id is not a string: %v", assocIDAttr)
			continue
		}

		// Extract the sort key: story_or_series_id.
		storyOrSeriesAttr, ok := item["story_or_series_id"]
		if !ok {
			log.Printf("Skipping item with no story_or_series_id: %v", item)
			continue
		}
		storyOrSeriesID, ok := storyOrSeriesAttr.(*dynatypes.AttributeValueMemberS)
		if !ok {
			log.Printf("story_or_series_id is not a string: %v", storyOrSeriesAttr)
			continue
		}

		// Extract aliases (optional).
		var aliases string
		if aliasAttr, exists := item["aliases"]; exists {
			if a, ok := aliasAttr.(*dynatypes.AttributeValueMemberS); ok {
				aliases = a.Value
			}
		}

		// Extract case_sensitive (optional).
		var caseSensitive bool
		if csAttr, exists := item["case_sensitive"]; exists {
			if cs, ok := csAttr.(*dynatypes.AttributeValueMemberBOOL); ok {
				caseSensitive = cs.Value
			}
		}

		// --- Update the associations table ---
		// Build the key using both association_id and story_or_series_id.
		updateAssociationsInput := &dynamodb.UpdateItemInput{
			TableName: awsString(AssociationsTable),
			Key: map[string]dynatypes.AttributeValue{
				"association_id":     &dynatypes.AttributeValueMemberS{Value: associationID.Value},
				"story_or_series_id": &dynatypes.AttributeValueMemberS{Value: storyOrSeriesID.Value},
			},
			UpdateExpression: awsString("SET aliases = :a, case_sensitive = :c"),
			ExpressionAttributeValues: map[string]dynatypes.AttributeValue{
				":a": &dynatypes.AttributeValueMemberS{Value: aliases},
				":c": &dynatypes.AttributeValueMemberBOOL{Value: caseSensitive},
			},
		}

		_, err := dynamoClient.UpdateItem(ctx, updateAssociationsInput)
		if err != nil {
			log.Printf("Failed to update associations for association_id=%s, story_or_series_id=%s: %v",
				associationID.Value, storyOrSeriesID.Value, err)
			continue
		}

		// --- Remove the attributes from the association_details table ---
		// Use an update with REMOVE expression for aliases and case_sensitive.
		updateDetailsInput := &dynamodb.UpdateItemInput{
			TableName: awsString(AssociationDetailsTable),
			Key: map[string]dynatypes.AttributeValue{
				"association_id":     &dynatypes.AttributeValueMemberS{Value: associationID.Value},
				"story_or_series_id": &dynatypes.AttributeValueMemberS{Value: storyOrSeriesID.Value},
			},
			UpdateExpression: awsString("REMOVE aliases, case_sensitive"),
		}

		_, err = dynamoClient.UpdateItem(ctx, updateDetailsInput)
		if err != nil {
			log.Printf("Failed to remove attributes from association_details for association_id=%s, story_or_series_id=%s: %v",
				associationID.Value, storyOrSeriesID.Value, err)
			continue
		}

		log.Printf("Processed association_id=%s, story_or_series_id=%s successfully", associationID.Value, storyOrSeriesID.Value)
	}

	return "Completed updating associations", nil
}

func main() {
	lambda.Start(handler)
}
