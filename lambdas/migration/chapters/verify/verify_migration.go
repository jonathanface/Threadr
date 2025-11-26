// Migration Verification Script
// Verifies that data was correctly migrated from old chapter tables to new unified table
//
// Build: go build -o verify_migration verify_migration.go
// Run: ./verify_migration

package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/joho/godotenv"
)

type VerificationResult struct {
	TableName     string
	StoryID       string
	ChapterID     string
	OldTableCount int
	NewTableCount int
	Match         bool
	Error         string
}

const (
	NewTableName = "story_blocks"
	TableSuffix  = ""
	TablePattern = "_blocks" + TableSuffix
)

func main() {
	ctx := context.Background()

	if err := godotenv.Load("../../../../.env"); err != nil {
		log.Fatal("warning: .env not loaded:", err)
	}

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	client := dynamodb.NewFromConfig(cfg)

	log.Println("=== Migration Verification Started ===")
	log.Println()

	// List all old chapter tables
	log.Println("[1/3] Discovering chapter tables...")
	tables, err := listChapterTables(ctx, client)
	if err != nil {
		log.Fatalf("Failed to list tables: %v", err)
	}
	log.Printf("Found %d chapter tables to verify\n\n", len(tables))

	// Verify each table
	log.Println("[2/3] Verifying migration for each table...")
	results := make([]VerificationResult, 0, len(tables))

	for i, tableInfo := range tables {
		log.Printf("Verifying %d/%d: %s", i+1, len(tables), tableInfo.TableName)

		result := verifyTable(ctx, client, tableInfo)
		results = append(results, result)

		if result.Match {
			log.Printf("  ✓ Match: %d items in both tables\n", result.OldTableCount)
		} else if result.Error != "" {
			log.Printf("  ✗ Error: %s\n", result.Error)
		} else {
			log.Printf("  ✗ Mismatch: Old=%d, New=%d\n", result.OldTableCount, result.NewTableCount)
		}
	}

	// Print summary
	log.Println("\n[3/3] Generating verification report...")
	printSummary(results)
}

func listChapterTables(ctx context.Context, client *dynamodb.Client) ([]ChapterTableInfo, error) {
	var tables []ChapterTableInfo
	var lastEvaluatedTableName *string

	for {
		input := &dynamodb.ListTablesInput{
			ExclusiveStartTableName: lastEvaluatedTableName,
			Limit:                   aws.Int32(100),
		}

		output, err := client.ListTables(ctx, input)
		if err != nil {
			return nil, fmt.Errorf("ListTables failed: %w", err)
		}

		for _, tableName := range output.TableNames {
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

type ChapterTableInfo struct {
	TableName string
	StoryID   string
	ChapterID string
}

func parseTableName(tableName string) *ChapterTableInfo {
	withoutSuffix := strings.TrimSuffix(tableName, TablePattern)
	parts := strings.Split(withoutSuffix, "_")

	if len(parts) < 2 {
		return nil
	}

	chapterID := parts[len(parts)-1]
	storyID := strings.Join(parts[:len(parts)-1], "_")

	return &ChapterTableInfo{
		TableName: tableName,
		StoryID:   storyID,
		ChapterID: chapterID,
	}
}

func verifyTable(ctx context.Context, client *dynamodb.Client, tableInfo ChapterTableInfo) VerificationResult {
	result := VerificationResult{
		TableName: tableInfo.TableName,
		StoryID:   tableInfo.StoryID,
		ChapterID: tableInfo.ChapterID,
	}

	// Count items in old table
	oldCount, err := countTableItems(ctx, client, tableInfo.TableName)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to count old table: %v", err)
		return result
	}
	result.OldTableCount = oldCount

	// Count items in new table for this chapter
	newCount, err := countChapterInNewTable(ctx, client, tableInfo.StoryID, tableInfo.ChapterID)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to count new table: %v", err)
		return result
	}
	result.NewTableCount = newCount

	// Check if counts match
	result.Match = (oldCount == newCount)

	return result
}

func countTableItems(ctx context.Context, client *dynamodb.Client, tableName string) (int, error) {
	// Use DescribeTable for quick count (may be approximate)
	output, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err != nil {
		return 0, err
	}

	// For more accurate count, use Scan with Select=COUNT
	scanOutput, err := client.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String(tableName),
		Select:    types.SelectCount,
	})
	if err != nil {
		return 0, err
	}

	// Use Scan count for accuracy
	count := int(scanOutput.Count)

	// Handle pagination if needed
	for scanOutput.LastEvaluatedKey != nil {
		scanOutput, err = client.Scan(ctx, &dynamodb.ScanInput{
			TableName:         aws.String(tableName),
			Select:            types.SelectCount,
			ExclusiveStartKey: scanOutput.LastEvaluatedKey,
		})
		if err != nil {
			return count, err
		}
		count += int(scanOutput.Count)
	}

	// Log if DescribeTable count differs significantly (indicates stale metadata)
	describeCount := int(aws.ToInt64(output.Table.ItemCount))
	if describeCount > 0 && abs(describeCount-count) > 10 {
		log.Printf("  Note: DescribeTable reported %d items, Scan found %d", describeCount, count)
	}

	return count, nil
}

func countChapterInNewTable(ctx context.Context, client *dynamodb.Client, storyID, chapterID string) (int, error) {
	compositeKey := fmt.Sprintf("%s#%s", storyID, chapterID)

	queryOutput, err := client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(NewTableName),
		KeyConditionExpression: aws.String("composite_key = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: compositeKey},
		},
		Select: types.SelectCount,
	})
	if err != nil {
		return 0, err
	}

	count := int(queryOutput.Count)

	// Handle pagination
	for queryOutput.LastEvaluatedKey != nil {
		queryOutput, err = client.Query(ctx, &dynamodb.QueryInput{
			TableName:              aws.String(NewTableName),
			KeyConditionExpression: aws.String("composite_key = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":pk": &types.AttributeValueMemberS{Value: compositeKey},
			},
			Select:            types.SelectCount,
			ExclusiveStartKey: queryOutput.LastEvaluatedKey,
		})
		if err != nil {
			return count, err
		}
		count += int(queryOutput.Count)
	}

	return count, nil
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func printSummary(results []VerificationResult) {
	totalTables := len(results)
	matchCount := 0
	mismatchCount := 0
	errorCount := 0
	totalOldItems := 0
	totalNewItems := 0

	var mismatches []VerificationResult
	var errors []VerificationResult

	for _, result := range results {
		totalOldItems += result.OldTableCount
		totalNewItems += result.NewTableCount

		if result.Error != "" {
			errorCount++
			errors = append(errors, result)
		} else if result.Match {
			matchCount++
		} else {
			mismatchCount++
			mismatches = append(mismatches, result)
		}
	}

	log.Println()
	log.Println(strings.Repeat("=", 70))
	log.Println("=== VERIFICATION SUMMARY ===")
	log.Println(strings.Repeat("=", 70))
	log.Printf("Total tables verified:     %d", totalTables)
	log.Printf("✓ Matching:                %d", matchCount)
	log.Printf("✗ Mismatches:              %d", mismatchCount)
	log.Printf("✗ Errors:                  %d", errorCount)
	log.Println()
	log.Printf("Total items in old tables: %d", totalOldItems)
	log.Printf("Total items in new table:  %d", totalNewItems)
	log.Printf("Difference:                %d", totalNewItems-totalOldItems)

	if len(mismatches) > 0 {
		log.Println("\nMISMATCHES DETECTED:")
		log.Println(strings.Repeat("-", 70))
		for _, result := range mismatches {
			log.Printf("  %s", result.TableName)
			log.Printf("    Story: %s, Chapter: %s", result.StoryID, result.ChapterID)
			log.Printf("    Old: %d items, New: %d items (diff: %d)",
				result.OldTableCount, result.NewTableCount,
				result.NewTableCount-result.OldTableCount)
		}
	}

	if len(errors) > 0 {
		log.Println("\nERRORS:")
		log.Println(strings.Repeat("-", 70))
		for _, result := range errors {
			log.Printf("  %s", result.TableName)
			log.Printf("    Error: %s", result.Error)
		}
	}

	log.Println()
	if matchCount == totalTables {
		log.Println("✓✓✓ ALL TABLES VERIFIED SUCCESSFULLY! ✓✓✓")
		log.Println("Migration is complete and data integrity is confirmed.")
	} else if mismatchCount > 0 || errorCount > 0 {
		log.Println("⚠️  VERIFICATION FAILED!")
		log.Println("Some tables have mismatches or errors. Review details above.")
		log.Println("DO NOT delete old tables until issues are resolved.")
	}
	log.Println(strings.Repeat("=", 70))
}
