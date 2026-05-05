// Chapter Blocks Migration Script
// Migrates data from individual chapter tables to unified story_blocks table
//
// Build: go build -o migrate_chapter_blocks migrate_chapter_blocks.go
// Run: ./migrate_chapter_blocks
//
// Or as Lambda:
// GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap migrate_chapter_blocks.go
// zip migrate_blocks.zip bootstrap

package main

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/joho/godotenv"
)

const (
	NewTableName   = "story_blocks"
	TableSuffix    = ""
	TablePattern   = "_blocks" + TableSuffix
	BatchWriteSize = 25 // DynamoDB limit
	MaxRetries     = 3
	RetryDelayMs   = 500
	// summaryDividerWidth is the column count for the `===` rules around
	// the migration summary report block.
	summaryDividerWidth = 60
)

type MigrationStats struct {
	TablesProcessed int
	TablesSkipped   int
	ItemsMigrated   int
	ItemsFailed     int
	TotalTables     int
	StartTime       time.Time
	Errors          []string
}

type ChapterTableInfo struct {
	TableName string
	StoryID   string
	ChapterID string
}

func main() {
	ctx := context.Background()

	if err := godotenv.Load("../../../../.env"); err != nil {
		log.Fatal("warning: .env not loaded:", err)
	}

	// Load AWS config
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	client := dynamodb.NewFromConfig(cfg)

	stats := &MigrationStats{
		StartTime: time.Now(),
		Errors:    []string{},
	}

	log.Println("=== Chapter Blocks Migration Started ===")
	log.Printf("Target table: %s\n", NewTableName)
	log.Printf("Timestamp: %s\n", stats.StartTime.Format(time.RFC3339))

	// Step 1: List all chapter tables
	log.Println("\n[1/4] Discovering chapter tables...")
	tables, err := listChapterTables(ctx, client)
	if err != nil {
		log.Fatalf("Failed to list tables: %v", err)
	}
	stats.TotalTables = len(tables)
	log.Printf("Found %d chapter tables to migrate\n", stats.TotalTables)

	// Step 2: Verify target table exists
	log.Println("\n[2/4] Verifying target table exists...")
	if err := verifyTargetTable(ctx, client); err != nil {
		log.Fatalf("Target table verification failed: %v", err)
	}
	log.Println("✓ Target table is ready")

	// Step 3: Migrate each table
	log.Println("\n[3/4] Starting migration...")
	for i, table := range tables {
		log.Printf("\n--- Processing table %d/%d: %s ---", i+1, stats.TotalTables, table.TableName)
		log.Printf("    Story ID: %s", table.StoryID)
		log.Printf("    Chapter ID: %s", table.ChapterID)

		if err := migrateTable(ctx, client, table, stats); err != nil {
			log.Printf("✗ Failed to migrate %s: %v", table.TableName, err)
			stats.TablesSkipped++
			stats.Errors = append(stats.Errors, fmt.Sprintf("%s: %v", table.TableName, err))
		} else {
			log.Printf("✓ Successfully migrated %s", table.TableName)
			stats.TablesProcessed++
		}
	}

	// Step 4: Print summary
	printSummary(stats)
}

func listChapterTables(ctx context.Context, client *dynamodb.Client) ([]ChapterTableInfo, error) {
	var tables []ChapterTableInfo
	var lastEvaluatedTableName *string

	for {
		input := &dynamodb.ListTablesInput{
			ExclusiveStartTableName: lastEvaluatedTableName,
			Limit:                   aws.Int32(100), //nolint:mnd
		}

		output, err := client.ListTables(ctx, input)
		if err != nil {
			return nil, fmt.Errorf("ListTables failed: %w", err)
		}

		for _, tableName := range output.TableNames {
			// Match pattern: {storyID}_{chapterID}_blocks_staging
			if strings.Contains(tableName, TablePattern) {
				info := parseTableName(tableName)
				if info != nil {
					tables = append(tables, *info)
				}
			}
		}

		lastEvaluatedTableName = output.LastEvaluatedTableName
		if lastEvaluatedTableName == nil {
			break
		}
	}

	return tables, nil
}

func parseTableName(tableName string) *ChapterTableInfo {
	// Expected format: {storyID}_{chapterID}_blocks_staging
	// Remove the suffix first
	withoutSuffix := strings.TrimSuffix(tableName, TablePattern)

	// Split by underscore
	parts := strings.Split(withoutSuffix, "_")

	// We expect exactly 2 parts: storyID and chapterID
	if len(parts) < 2 { //nolint:mnd
		log.Printf("Warning: Could not parse table name: %s", tableName)
		return nil
	}

	// Handle case where IDs might contain underscores (UUIDs don't, but just in case)
	// Take last part as chapterID, everything before as storyID
	chapterID := parts[len(parts)-1]
	storyID := strings.Join(parts[:len(parts)-1], "_")

	return &ChapterTableInfo{
		TableName: tableName,
		StoryID:   storyID,
		ChapterID: chapterID,
	}
}

func verifyTargetTable(ctx context.Context, client *dynamodb.Client) error {
	_, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: aws.String(NewTableName),
	})
	if err != nil {
		return fmt.Errorf("target table %s does not exist or is not accessible: %w", NewTableName, err)
	}
	return nil
}

func migrateTable(ctx context.Context, client *dynamodb.Client, table ChapterTableInfo, stats *MigrationStats) error {
	// Scan the old table
	log.Printf("  Scanning table %s...", table.TableName)
	items, err := scanTable(ctx, client, table.TableName)
	if err != nil {
		return fmt.Errorf("scan failed: %w", err)
	}
	log.Printf("  Found %d items to migrate", len(items))

	if len(items) == 0 {
		log.Printf("  Skipping empty table")
		return nil
	}

	// Transform items
	log.Printf("  Transforming items...")
	transformedItems := transformItems(items, table.StoryID, table.ChapterID)

	// Batch write to new table
	log.Printf("  Writing to new table...")
	migratedCount, failedCount, err := batchWriteItems(ctx, client, transformedItems)
	stats.ItemsMigrated += migratedCount
	stats.ItemsFailed += failedCount

	if err != nil {
		return fmt.Errorf("batch write failed: %w", err)
	}

	// Verify count (may differ if duplicates were removed)
	if migratedCount != len(transformedItems) {
		return fmt.Errorf("count mismatch: transformed %d, migrated %d", len(transformedItems), migratedCount)
	}

	if len(transformedItems) < len(items) {
		log.Printf(
			"  ✓ Migrated %d/%d items (removed %d duplicates)",
			migratedCount,
			len(items),
			len(items)-len(transformedItems),
		)
	} else {
		log.Printf("  ✓ Migrated %d/%d items", migratedCount, len(items))
	}
	return nil
}

func scanTable(
	ctx context.Context,
	client *dynamodb.Client,
	tableName string,
) ([]map[string]types.AttributeValue, error) {
	var items []map[string]types.AttributeValue
	var lastEvaluatedKey map[string]types.AttributeValue

	for {
		input := &dynamodb.ScanInput{
			TableName:         aws.String(tableName),
			ExclusiveStartKey: lastEvaluatedKey,
		}

		output, err := client.Scan(ctx, input)
		if err != nil {
			return nil, err
		}

		items = append(items, output.Items...)

		lastEvaluatedKey = output.LastEvaluatedKey
		if lastEvaluatedKey == nil {
			break
		}
	}

	return items, nil
}

func transformItems(
	items []map[string]types.AttributeValue,
	storyID, chapterID string,
) []map[string]types.AttributeValue {
	compositeKey := fmt.Sprintf("%s#%s", storyID, chapterID)

	// Use map to deduplicate by (composite_key, place)
	deduped := make(map[string]map[string]types.AttributeValue)

	for _, item := range items {
		newItem := make(map[string]types.AttributeValue)

		// Set composite key
		newItem["composite_key"] = &types.AttributeValueMemberS{Value: compositeKey}

		// Set story_id and chapter_id explicitly
		newItem["story_id"] = &types.AttributeValueMemberS{Value: storyID}
		newItem["chapter_id"] = &types.AttributeValueMemberS{Value: chapterID}

		// Copy place (convert to Number if it's a string)
		var placeValue string
		if placeAttr, exists := item["place"]; exists {
			switch v := placeAttr.(type) {
			case *types.AttributeValueMemberN:
				placeValue = v.Value
				newItem["place"] = v
			case *types.AttributeValueMemberS:
				// Convert string to number
				if placeNum, err := strconv.ParseInt(v.Value, 10, 64); err == nil {
					placeValue = strconv.FormatInt(placeNum, 10)
					newItem["place"] = &types.AttributeValueMemberN{Value: placeValue}
				}
			}
		}

		// Copy key_id
		if keyID, exists := item["key_id"]; exists {
			newItem["key_id"] = keyID
		}

		// Copy chunk (Lexical JSON content)
		if chunk, exists := item["chunk"]; exists {
			newItem["chunk"] = chunk
		}

		// Copy optional fields
		if author, exists := item["author"]; exists {
			newItem["author"] = author
		}
		if createdAt, exists := item["created_at"]; exists {
			newItem["created_at"] = createdAt
		}
		if modifiedAt, exists := item["modified_at"]; exists {
			newItem["modified_at"] = modifiedAt
		}

		// Create unique key for deduplication: composite_key#place
		dedupKey := fmt.Sprintf("%s#%s", compositeKey, placeValue)

		// If duplicate, keep the one with latest modified_at, or just keep first
		if existing, exists := deduped[dedupKey]; exists {
			log.Printf("  Warning: Duplicate place value %s found, keeping first occurrence", placeValue)
			// Could compare modified_at here if needed, for now keep first
			_ = existing
			continue
		}

		deduped[dedupKey] = newItem
	}

	// Convert map back to slice
	transformed := make([]map[string]types.AttributeValue, 0, len(deduped))
	for _, item := range deduped {
		transformed = append(transformed, item)
	}

	if len(transformed) < len(items) {
		log.Printf("  Deduplication: %d items -> %d items (removed %d duplicates)",
			len(items), len(transformed), len(items)-len(transformed))
	}

	return transformed
}

func batchWriteItems(
	ctx context.Context,
	client *dynamodb.Client,
	items []map[string]types.AttributeValue,
) (migrated, failed int, err error) {
	// Split into batches of 25 (DynamoDB limit)
	for i := 0; i < len(items); i += BatchWriteSize {
		end := min(i+BatchWriteSize, len(items))
		batch := items[i:end]

		// Build write requests
		writeRequests := make([]types.WriteRequest, len(batch))
		for j, item := range batch {
			writeRequests[j] = types.WriteRequest{
				PutRequest: &types.PutRequest{
					Item: item,
				},
			}
		}

		// Write with retries
		requestItems := map[string][]types.WriteRequest{
			NewTableName: writeRequests,
		}

		retries := 0
		for {
			output, err := client.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{
				RequestItems: requestItems,
			})

			if err != nil {
				if retries < MaxRetries {
					retries++
					log.Printf("  Batch write error, retrying (%d/%d): %v", retries, MaxRetries, err)
					time.Sleep(time.Duration(RetryDelayMs*retries) * time.Millisecond)
					continue
				}
				return migrated, failed + len(batch), fmt.Errorf("batch write failed after retries: %w", err)
			}

			// Check for unprocessed items
			if len(output.UnprocessedItems) > 0 {
				if retries < MaxRetries {
					retries++
					log.Printf(
						"  %d unprocessed items, retrying (%d/%d)",
						len(output.UnprocessedItems[NewTableName]),
						retries,
						MaxRetries,
					)
					requestItems = output.UnprocessedItems
					time.Sleep(time.Duration(RetryDelayMs*retries) * time.Millisecond)
					continue
				}
				failed += len(output.UnprocessedItems[NewTableName])
				migrated += len(batch) - len(output.UnprocessedItems[NewTableName])
				log.Printf("  Warning: %d items unprocessed after retries", len(output.UnprocessedItems[NewTableName]))
				break
			}

			// Success
			migrated += len(batch)
			break
		}
	}

	return migrated, failed, nil
}

func printSummary(stats *MigrationStats) {
	duration := time.Since(stats.StartTime)

	log.Println("\n" + strings.Repeat("=", summaryDividerWidth))
	log.Println("=== MIGRATION SUMMARY ===")
	log.Println(strings.Repeat("=", summaryDividerWidth))
	log.Printf("Total tables found:      %d", stats.TotalTables)
	log.Printf("Tables migrated:         %d", stats.TablesProcessed)
	log.Printf("Tables skipped:          %d", stats.TablesSkipped)
	log.Printf("Items migrated:          %d", stats.ItemsMigrated)
	log.Printf("Items failed:            %d", stats.ItemsFailed)
	log.Printf("Duration:                %s", duration.Round(time.Second))
	log.Printf("Average:                 %.2f tables/min", float64(stats.TablesProcessed)/(duration.Minutes()))

	if len(stats.Errors) > 0 {
		log.Println("\nERRORS:")
		for _, err := range stats.Errors {
			log.Printf("  - %s", err)
		}
	}

	if stats.ItemsFailed > 0 {
		log.Println("\n⚠️  WARNING: Some items failed to migrate. Review logs above.")
	}

	if stats.TablesProcessed == stats.TotalTables && stats.ItemsFailed == 0 {
		log.Println("\n✓ Migration completed successfully!")
	} else {
		log.Println("\n⚠️  Migration completed with errors. Review summary above.")
	}
	log.Println(strings.Repeat("=", summaryDividerWidth))
}
