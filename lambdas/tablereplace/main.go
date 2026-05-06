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

// tableOpPollInterval is how often we poll DynamoDB while waiting for an
// async table delete or backup to finish.
const tableOpPollInterval = 5 * time.Second

// handler is the Lambda function handler. For each DynamoDB table whose
// name ends in "-rollout" it backs up the rollout table and restores it
// under the suffix-stripped name, replacing any existing table with that
// name. Per-table failures are logged and the next table is processed.
func handler(ctx context.Context) error {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("unable to load AWS SDK config: %w", err)
	}
	client := ddb.NewFromConfig(cfg)

	tables, err := listAllTables(ctx, client)
	if err != nil {
		return err
	}
	for _, tableName := range tables {
		if !strings.HasSuffix(tableName, "-rollout") {
			continue
		}
		if rErr := replaceTableFromRollout(ctx, client, tableName); rErr != nil {
			log.Printf("Failed to replace table from rollout %q: %v", tableName, rErr)
		}
	}
	return nil
}

// listAllTables returns every DynamoDB table name in the region, following
// ListTables pagination to completion.
func listAllTables(ctx context.Context, client *ddb.Client) ([]string, error) {
	var tables []string
	var lastEvaluatedTableName *string
	for {
		out, err := client.ListTables(ctx, &ddb.ListTablesInput{
			ExclusiveStartTableName: lastEvaluatedTableName,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list tables: %w", err)
		}
		tables = append(tables, out.TableNames...)
		if out.LastEvaluatedTableName == nil {
			return tables, nil
		}
		lastEvaluatedTableName = out.LastEvaluatedTableName
	}
}

// replaceTableFromRollout performs the four-step swap: delete the existing
// target if present, back up the rollout table, wait for the backup to be
// available, then restore from that backup under the target name.
func replaceTableFromRollout(ctx context.Context, client *ddb.Client, rolloutTable string) error {
	targetName := strings.TrimSuffix(rolloutTable, "-rollout")
	log.Printf("Processing table %q; target table name will be %q.", rolloutTable, targetName)

	if err := dropTableIfExists(ctx, client, targetName); err != nil {
		return err
	}

	backupArn, err := createBackup(ctx, client, rolloutTable)
	if err != nil {
		return err
	}
	waitForBackupAvailable(ctx, client, backupArn)

	if _, err = client.RestoreTableFromBackup(ctx, &ddb.RestoreTableFromBackupInput{
		TargetTableName: aws.String(targetName),
		BackupArn:       aws.String(backupArn),
	}); err != nil {
		return fmt.Errorf("failed to restore table %q from backup: %w", targetName, err)
	}
	log.Printf("Successfully restored table %q from backup of %q", targetName, rolloutTable)
	return nil
}

// dropTableIfExists deletes targetName if it exists and waits for the
// delete to finish. Returns nil if the table doesn't exist (treated as
// "not-found" via name-substring matching since the SDK doesn't surface a
// typed error here).
func dropTableIfExists(ctx context.Context, client *ddb.Client, targetName string) error {
	_, err := client.DescribeTable(ctx, &ddb.DescribeTableInput{
		TableName: aws.String(targetName),
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "ResourceNotFoundException") {
			return nil
		}
		return fmt.Errorf("unexpected error describing table %q: %w", targetName, err)
	}
	log.Printf("Target table %q already exists. Deleting it.", targetName)
	if _, err = client.DeleteTable(ctx, &ddb.DeleteTableInput{
		TableName: aws.String(targetName),
	}); err != nil {
		return fmt.Errorf("failed to delete table %q: %w", targetName, err)
	}
	for {
		_, err = client.DescribeTable(ctx, &ddb.DescribeTableInput{
			TableName: aws.String(targetName),
		})
		if err != nil {
			// DescribeTable error here means the delete completed and the
			// table no longer exists; that's the success signal we're waiting
			// for, not a failure to propagate.
			log.Printf("Table %q successfully deleted.", targetName)
			return nil //nolint:nilerr
		}
		log.Printf("Waiting for table %q to be deleted...", targetName)
		time.Sleep(tableOpPollInterval)
	}
}

// createBackup kicks off an on-demand backup of tableName and returns the
// new backup ARN.
func createBackup(ctx context.Context, client *ddb.Client, tableName string) (string, error) {
	backupName := fmt.Sprintf("%s-backup-%d", tableName, time.Now().Unix())
	out, err := client.CreateBackup(ctx, &ddb.CreateBackupInput{
		TableName:  aws.String(tableName),
		BackupName: aws.String(backupName),
	})
	if err != nil {
		return "", fmt.Errorf("failed to create backup for table %q: %w", tableName, err)
	}
	arn := *out.BackupDetails.BackupArn
	log.Printf("Backup created for %q. Backup ARN: %s", tableName, arn)
	return arn, nil
}

// waitForBackupAvailable polls DescribeBackup until the backup reaches the
// AVAILABLE state. A DescribeBackup error breaks the loop (best-effort —
// the caller's RestoreTableFromBackup will surface any real problem).
func waitForBackupAvailable(ctx context.Context, client *ddb.Client, backupArn string) {
	for {
		descOut, err := client.DescribeBackup(ctx, &ddb.DescribeBackupInput{
			BackupArn: aws.String(backupArn),
		})
		if err != nil {
			log.Printf("Error describing backup %s: %v", backupArn, err)
			return
		}
		status := descOut.BackupDescription.BackupDetails.BackupStatus
		if status == types.BackupStatusAvailable {
			return
		}
		log.Printf("Waiting for backup %s to become available (current status: %s)...", backupArn, status)
		time.Sleep(tableOpPollInterval)
	}
}

func main() {
	lambda.Start(handler)
}
