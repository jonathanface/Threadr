// this will live on lambda
// build: GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o deleteOldCrap scripts/deleteOldCrap.go && chmod -x deleteOldCrap

package main

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Request struct {
	TableName string `json:"tableName"`
}

type Response struct {
	Message string `json:"message"`
}

func HandleRequest(ctx context.Context) (Response, error) {

	tables := []string{
		"chapters",
		"stories",
		"association_details",
		"associations",
		"series",
		"stories",
	}

	// Load AWS SDK configuration
	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		return Response{}, err
	}

	// Create DynamoDB client
	client := dynamodb.NewFromConfig(cfg)

	// Calculate the expiration date
	expirationTime := time.Now().AddDate(0, 0, -35)
	count := 0
	for _, tbl := range tables {
		// Build the scan input to find expired rows
		scanInput := &dynamodb.ScanInput{
			TableName:        aws.String(tbl),
			FilterExpression: aws.String("#deleted_at < :expiration_time"),
			ExpressionAttributeNames: map[string]string{
				"#deleted_at": "deleted_at",
			},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":expiration_time": &types.AttributeValueMemberS{
					Value: expirationTime.Format(time.RFC3339),
				},
			},
		}

		// Execute the scan operation to find expired rows
		scanResult, err := client.Scan(ctx, scanInput)
		if err != nil {
			return Response{}, err
		}

		if len(scanResult.Items) == 0 {
			fmt.Printf("no items marked for deletion in %s\n", tbl)
			continue
		}

		// Delete the expired rows
		for _, item := range scanResult.Items {
			// Extract the primary key values from the item
			primaryKey := map[string]types.AttributeValue{
				"partitionKey": item["partitionKey"],
				"sortKey":      item["sortKey"],
			}

			// Delete the item using the primary key values
			deleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String(tbl),
				Key:       primaryKey,
			}

			_, err := client.DeleteItem(ctx, deleteInput)
			if err != nil {
				return Response{}, err
			}
			count++
			fmt.Println("Deleted item:", primaryKey)
		}
		fmt.Printf("expired rows in %s deleted successfully\n", tbl)
	}
	return Response{Message: fmt.Sprintf("expired rows deleted successfully, %d rows purged\n", count)}, nil
}

func main() {
	lambda.Start(HandleRequest)
}
