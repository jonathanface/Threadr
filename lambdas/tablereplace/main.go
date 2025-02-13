package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	ddb "github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// handler is the Lambda function handler.
func handler(ctx context.Context) error {
	// Load AWS SDK configuration.
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	client := ddb.NewFromConfig(cfg)

	// List all DynamoDB tables.
	var tables []string
	var lastEvaluatedTableName *string
	for {
		out, err := client.ListTables(ctx, &ddb.ListTablesInput{
			ExclusiveStartTableName: lastEvaluatedTableName,
		})
		if err != nil {
			return fmt.Errorf("failed to list tables: %w", err)
		}

		tables = append(tables, out.TableNames...)
		if out.LastEvaluatedTableName == nil {
			break
		}
		lastEvaluatedTableName = out.LastEvaluatedTableName
	}

	// Process each table ending with "-rollout".
	for _, tableName := range tables {
		if !strings.HasSuffix(tableName, "-rollout") {
			continue
		}

		newTableName := strings.TrimSuffix(tableName, "-rollout")
		log.Printf("Processing table %q; target table name will be %q.", tableName, newTableName)

		// Check if the target table already exists.
		_, err := client.DescribeTable(ctx, &ddb.DescribeTableInput{
			TableName: aws.String(newTableName),
		})
		if err == nil {
			// Table exists; delete it.
			log.Printf("Target table %q already exists. Deleting it.", newTableName)
			_, err := client.DeleteTable(ctx, &ddb.DeleteTableInput{
				TableName: aws.String(newTableName),
			})
			if err != nil {
				log.Printf("Failed to delete table %q: %v", newTableName, err)
				continue
			}

			// Wait for the table to be fully deleted.
			for {
				_, err = client.DescribeTable(ctx, &ddb.DescribeTableInput{
					TableName: aws.String(newTableName),
				})
				if err != nil {
					// Assuming error means table does not exist.
					log.Printf("Table %q successfully deleted.", newTableName)
					break
				}
				log.Printf("Waiting for table %q to be deleted...", newTableName)
				time.Sleep(5 * time.Second)
			}
		} else {
			// If error is not "table not found", log unexpected error.
			if !strings.Contains(err.Error(), "not found") &&
				!strings.Contains(err.Error(), "ResourceNotFoundException") {
				log.Printf("Unexpected error describing table %q: %v", newTableName, err)
				continue
			}
		}

		// Create an on-demand backup of the original table.
		backupName := fmt.Sprintf("%s-backup-%d", tableName, time.Now().Unix())
		backupOut, err := client.CreateBackup(ctx, &ddb.CreateBackupInput{
			TableName:  aws.String(tableName),
			BackupName: aws.String(backupName),
		})
		if err != nil {
			log.Printf("Failed to create backup for table %q: %v", tableName, err)
			continue
		}

		backupArn := *backupOut.BackupDetails.BackupArn
		log.Printf("Backup created for %q. Backup ARN: %s", tableName, backupArn)

		// Wait for the backup to become available (poll every 5 seconds).
		for {
			descOut, err := client.DescribeBackup(ctx, &ddb.DescribeBackupInput{
				BackupArn: aws.String(backupArn),
			})
			if err != nil {
				log.Printf("Error describing backup %s: %v", backupArn, err)
				break
			}
			status := descOut.BackupDescription.BackupDetails.BackupStatus
			if status == types.BackupStatusAvailable {
				break
			}
			log.Printf("Waiting for backup %s to become available (current status: %s)...", backupArn, status)
			time.Sleep(5 * time.Second)
		}

		// Restore the table from the backup with the new table name.
		_, err = client.RestoreTableFromBackup(ctx, &ddb.RestoreTableFromBackupInput{
			TargetTableName: aws.String(newTableName),
			BackupArn:       aws.String(backupArn),
		})
		if err != nil {
			log.Printf("Failed to restore table %q from backup: %v", newTableName, err)
			continue
		}

		log.Printf("Successfully restored table %q from backup of %q", newTableName, tableName)
	}

	return nil
}

func main() {
	lambda.Start(handler)
}
