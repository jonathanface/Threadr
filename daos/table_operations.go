package daos

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

func (d *DAO) createBlockTable(ctx context.Context, tableName string, tags *[]types.Tag) error {
	partitionKey := aws.String("key_id")
	gsiPartKey := aws.String("story_id")
	gsiSortKey := aws.String("place")

	tableSchema := []types.KeySchemaElement{
		{
			AttributeName: partitionKey,
			KeyType:       types.KeyTypeHash, // Partition key
		},
	}

	gsiSchema := []types.KeySchemaElement{
		{
			AttributeName: gsiPartKey,
			KeyType:       types.KeyTypeHash,
		},
		{
			AttributeName: gsiSortKey,
			KeyType:       types.KeyTypeRange,
		},
	}
	attributes := []types.AttributeDefinition{
		{
			AttributeName: partitionKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiPartKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiSortKey,
			AttributeType: types.ScalarAttributeTypeN,
		},
	}

	gsiSettings := []types.GlobalSecondaryIndex{
		{
			IndexName: aws.String("story_id-place-index"),
			KeySchema: gsiSchema,
			Projection: &types.Projection{
				ProjectionType: types.ProjectionTypeAll,
			},
		},
	}

	_, err := d.DynamoClient.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName:              aws.String(tableName),
		KeySchema:              tableSchema,
		AttributeDefinitions:   attributes,
		BillingMode:            types.BillingModePayPerRequest,
		GlobalSecondaryIndexes: gsiSettings,
		Tags:                   *tags,
	})
	if err != nil {
		return err
	}

	go func() {
		// Use Background context as this goroutine needs to outlive the request
		bgCtx := context.Background()
		waiter := dynamodb.NewTableExistsWaiter(d.DynamoClient)
		if err = waiter.Wait(bgCtx, &dynamodb.DescribeTableInput{
			TableName: aws.String(tableName),
		}, 1*time.Minute); err != nil {
			fmt.Println("error waiting for table creation", err)
			return
		}
		// Enable Point-in-Time Recovery (PITR)
		pitrInput := &dynamodb.UpdateContinuousBackupsInput{
			TableName: aws.String(tableName),
			PointInTimeRecoverySpecification: &types.PointInTimeRecoverySpecification{
				PointInTimeRecoveryEnabled: aws.Bool(true),
			},
		}

		for {
			_, err := d.DynamoClient.UpdateContinuousBackups(bgCtx, pitrInput)
			if err == nil {
				break // PITR enabled successfully
			}

			// Check if the error indicates ongoing backup enablement
			if err.Error() == "ContinuousBackupsUnavailableException: Backups are being enabled for the table" {
				fmt.Println("enabling backups error", err)
				return
			}
			fmt.Println("Backups are being enabled for the table. Retrying in 10 seconds...")
			time.Sleep(10 * time.Second)
		}

		_, err := d.DynamoClient.UpdateContinuousBackups(bgCtx, pitrInput)
		if err != nil {
			fmt.Println("error enabling continuous backups", err)
		}
	}()
	return nil
}

func (d *DAO) CheckTableStatus(ctx context.Context, tableName string) (string, error) {
	resp, err := d.DynamoClient.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(tableName)})
	if err != nil {
		return "", err
	}
	return string(resp.Table.TableStatus), nil
}

func isResourceNotFound(err error) bool {
	var op *smithy.OperationError
	if errors.As(err, &op) {
		var nf *types.ResourceNotFoundException
		return errors.As(op.Unwrap(), &nf)
	}
	return false
}

// Detect TableInUse from RestoreTableFromBackup
func isTableInUse(err error) bool {
	var op *smithy.OperationError
	if errors.As(err, &op) {
		var inUse *types.TableInUseException
		return errors.As(op.Unwrap(), &inUse)
	}
	return false
}

func isTableAlreadyExists(err error) bool {
	var op *smithy.OperationError
	if errors.As(err, &op) {
		var exists *types.TableAlreadyExistsException
		return errors.As(op.Unwrap(), &exists)
	}
	return false
}

func waitForTableStatus(ctx context.Context, client dynamoDBClient, tableName, chapterName, want string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	backoff := 500 * time.Millisecond

	for {
		if time.Now().After(deadline) {
			return fmt.Errorf("timeout waiting for table %s to reach status %s", tableName, want)
		}
		out, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String(tableName),
		})
		if err != nil {
			if isResourceNotFound(err) && want == "NOT_EXISTS" {
				return nil
			}
		} else {
			got := string(out.Table.TableStatus)
			log.Printf("table %s status is: %s\n", chapterName, got)
			if got == want {
				return nil
			}
		}
		time.Sleep(backoff)
		// capped exponential backoff
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
}
