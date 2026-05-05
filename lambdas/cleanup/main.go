// build: GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap main.go
// zip: zip cleanupJob.zip bootstrap

package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Response struct{ Message string }

// ... existing Response, keyOnly, etc.

type chapterKey struct {
	StoryID   string
	ChapterID string
}

func HandleRequest(ctx context.Context) (Response, error) {
	baseTables := []string{
		"chapters",
		"stories",
		"association_details",
		"associations",
		"series",
		"story_settings",
		"outlines",
		"users",
	}

	// Which variants to run. Default: prod + _staging.
	// You can override via env, e.g. VARIANTS="" to run prod only,
	// or VARIANTS="_staging" to run just staging.
	variants := []string{"", "_staging"}
	if v := os.Getenv("VARIANTS"); v != "" {
		// comma separated like: "",_staging  or  _staging
		variants = splitCSV(v)
	}

	// Build final table list
	var tables []string
	for _, b := range baseTables {
		for _, suf := range variants {
			tables = append(tables, b+suf)
		}
	}

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return Response{}, err
	}
	client := dynamodb.NewFromConfig(cfg)

	cutoff := time.Now().AddDate(0, 0, -30).Unix()

	total := 0
	for _, tbl := range tables {
		// purgeTable now also returns discovered chapter keys for cascade
		n, chapterKeys, err := purgeTable(ctx, client, tbl, cutoff)
		if err != nil {
			return Response{}, fmt.Errorf("%s: %w", tbl, err)
		}
		total += n

		// If this is a chapters* table, cascade delete its blocks tables + backups
		if isChaptersTable(tbl) && len(chapterKeys) > 0 {
			staging := strings.HasSuffix(tbl, "_staging")
			if err := deleteBlocksTablesAndBackups(ctx, client, chapterKeys, staging); err != nil {
				return Response{}, fmt.Errorf("cascade (%s): %w", tbl, err)
			}
		}
	}

	return Response{Message: fmt.Sprintf("expired rows deleted successfully, %d rows purged", total)}, nil
}

// isChaptersTable returns true for "chapters" and "chapters_staging".
func isChaptersTable(name string) bool {
	return name == "chapters" || name == "chapters_staging"
}

func splitCSV(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}

type keySpec struct {
	pk    string
	sk    string
	hasSK bool
}

func keyNamesForTable(table string) keySpec {
	switch table {
	case "stories", "stories_staging", "story_settings", "story_settings_staging":
		return keySpec{pk: "story_id", sk: "author", hasSK: true}
	case "associations", "associations_staging", "association_details", "association_details_staging":
		return keySpec{pk: "association_id", sk: "story_or_series_id", hasSK: true}
	case "series", "series_staging":
		return keySpec{pk: "series_id", sk: "author", hasSK: true}
	case "chapters", "chapters_staging":
		// assuming your chapters table uses these attribute names
		return keySpec{pk: "story_id", sk: "chapter_id", hasSK: true}
	case "outlines", "outlines_staging":
		return keySpec{pk: "story_id", sk: "place", hasSK: true}
	case "users", "users_staging":
		return keySpec{pk: "email", hasSK: false}
	default:
		// fallback to your legacy names; adjust if you know others
		return keySpec{pk: "key_id", hasSK: false}
	}
}

func avToString(av types.AttributeValue) (string, bool) {
	switch v := av.(type) {
	case *types.AttributeValueMemberS:
		return v.Value, true
	case *types.AttributeValueMemberN:
		// v.Value is already the canonical string form of the number
		return v.Value, true
	case *types.AttributeValueMemberB:
		// keys can be binary; stringify as base64 so it's safe in table names
		return base64.StdEncoding.EncodeToString(v.Value), true
	default:
		return "", false
	}
}

func purgeTable(
	ctx context.Context,
	client *dynamodb.Client,
	table string,
	cutoffUnix int64,
) (int, []chapterKey, error) {
	tk := keyNamesForTable(table)

	filter := aws.String("attribute_exists(#deleted_at) AND #deleted_at < :cutoff")
	eav := map[string]types.AttributeValue{
		":cutoff": &types.AttributeValueMemberN{Value: strconv.FormatInt(cutoffUnix, 10)},
	}
	ean := map[string]string{
		"#deleted_at": "deleted_at",
		"#pk":         tk.pk,
	}
	proj := "#pk"
	if tk.hasSK {
		ean["#sk"] = tk.sk
		proj += ",#sk"
	}

	var lastKey map[string]types.AttributeValue
	keys := make([]map[string]types.AttributeValue, 0, 256) //nolint:mnd

	collectChapters := table == "chapters" || table == "chapters_staging"
	var chapterIDs []chapterKey

	for {
		out, err := client.Scan(ctx, &dynamodb.ScanInput{
			TableName:                 aws.String(table),
			FilterExpression:          filter,
			ExpressionAttributeNames:  ean,
			ExpressionAttributeValues: eav,
			ProjectionExpression:      aws.String(proj),
			ExclusiveStartKey:         lastKey,
		})
		if err != nil {
			// If table's gone, skip gracefully
			var rnfe *types.ResourceNotFoundException
			if errors.As(err, &rnfe) {
				fmt.Printf("table %s not found, skipping\n", table)
				return 0, nil, nil
			}
			return 0, nil, err
		}

		for _, it := range out.Items {
			pkAttr, ok := it[tk.pk]
			if !ok || pkAttr == nil {
				fmt.Printf("warn: %s item missing partition key (%s); skipping\n", table, tk.pk)
				continue
			}
			key := map[string]types.AttributeValue{tk.pk: pkAttr}

			var skAttr types.AttributeValue
			if tk.hasSK {
				var ok2 bool
				skAttr, ok2 = it[tk.sk]
				if !ok2 || skAttr == nil {
					fmt.Printf("warn: %s item missing sort key (%s); skipping\n", table, tk.sk)
					continue
				}
				key[tk.sk] = skAttr
			}
			keys = append(keys, key)

			if collectChapters {
				story, sOK := avToString(pkAttr)
				chap, cOK := avToString(skAttr)
				if sOK && cOK {
					chapterIDs = append(chapterIDs, chapterKey{StoryID: story, ChapterID: chap})
				}
			}
		}

		if len(out.LastEvaluatedKey) == 0 {
			break
		}
		lastKey = out.LastEvaluatedKey
	}

	if len(keys) == 0 {
		fmt.Printf("no items marked for deletion in %s\n", table)
		return 0, chapterIDs, nil
	}

	deletedCount, err := batchDeleteKeys(ctx, client, table, keys)
	if err != nil {
		return deletedCount, chapterIDs, err
	}

	fmt.Printf("expired rows in %s deleted successfully: %d\n", table, deletedCount)
	return deletedCount, chapterIDs, nil
}

// at top: import "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

func batchDeleteKeys(
	ctx context.Context,
	client *dynamodb.Client,
	table string,
	keys []map[string]types.AttributeValue, // <-- changed
) (int, error) {
	deleted := 0
	for i := 0; i < len(keys); i += 25 {
		end := min(
			//nolint:mnd
			i+25, len(keys))

		initial := make([]types.WriteRequest, 0, end-i)
		for _, k := range keys[i:end] {
			initial = append(initial, types.WriteRequest{
				DeleteRequest: &types.DeleteRequest{Key: k}, // <-- use map directly
			})
		}
		req := map[string][]types.WriteRequest{table: initial}

		for {
			out, err := client.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{RequestItems: req})
			if err != nil {
				return deleted, err
			}
			submitted := len(req[table])
			unprocessed := 0
			if up, ok := out.UnprocessedItems[table]; ok {
				unprocessed = len(up)
			}
			deleted += (submitted - unprocessed)

			if up := out.UnprocessedItems; len(up) > 0 && len(up[table]) > 0 {
				req = up
				continue
			}
			break
		}
	}
	return deleted, nil
}

// Deletes all tables that start with the blocks base name and their on-demand backups.
func deleteBlocksTablesAndBackups(
	ctx context.Context,
	client *dynamodb.Client,
	chapters []chapterKey,
	staging bool,
) error {
	// de-dup bases
	seen := make(map[string]struct{})
	for _, ck := range chapters {
		base := fmt.Sprintf("%s_%s_blocks", ck.StoryID, ck.ChapterID)
		if staging {
			base += "_staging"
		}
		if _, ok := seen[base]; !ok {
			seen[base] = struct{}{}
		}
	}

	// ListTables once (paged), then filter by prefix for each base
	allTables, err := listAllTables(ctx, client)
	if err != nil {
		return err
	}

	for base := range seen {
		fmt.Printf("deleting block table %s\n", base)
		// find matching tables (covers copies like _backup_YYYY, _v2, etc.)
		var matches []string
		for _, t := range allTables {
			if strings.HasPrefix(t, base) {
				matches = append(matches, t)
			}
		}
		if len(matches) == 0 {
			fmt.Printf("no blocks tables found for prefix %q\n", base)
			continue
		}

		for _, t := range matches {
			// Delete on-demand backups of this table first (optional but tidy)
			if err := deleteAllBackupsForTable(ctx, client, t); err != nil {
				// log and continue; backups can be absent or permissions restricted
				fmt.Printf("warn: delete backups for %s: %v\n", t, err)
			}

			// Delete the table
			if err := deleteTableIfExists(ctx, client, t); err != nil {
				return fmt.Errorf("delete table %s: %w", t, err)
			}
			fmt.Printf("block table %s was deleted\n", base)
		}
	}
	return nil
}

func listAllTables(ctx context.Context, client *dynamodb.Client) ([]string, error) {
	var outNames []string
	var last *string
	for {
		out, err := client.ListTables(ctx, &dynamodb.ListTablesInput{
			ExclusiveStartTableName: last,
			Limit:                   aws.Int32(100), //nolint:mnd
		})
		if err != nil {
			return nil, err
		}
		outNames = append(outNames, out.TableNames...)
		if out.LastEvaluatedTableName == nil || *out.LastEvaluatedTableName == "" {
			break
		}
		last = out.LastEvaluatedTableName
	}
	return outNames, nil
}

func deleteTableIfExists(ctx context.Context, client *dynamodb.Client, name string) error {
	// Best-effort describe to check existence
	_, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(name)})
	if err != nil {
		// If not found, nothing to do
		var rnfe *types.ResourceNotFoundException
		if ok := errors.As(err, &rnfe); ok {
			fmt.Printf("table %s not found, skipping\n", name)
			return nil
		}
		// Other errors
		return err
	}
	// Issue delete
	_, err = client.DeleteTable(ctx, &dynamodb.DeleteTableInput{TableName: aws.String(name)})
	if err != nil {
		return err
	}
	fmt.Printf("delete initiated for table %s\n", name)
	return nil
}

func deleteAllBackupsForTable(ctx context.Context, client *dynamodb.Client, tableName string) error {
	// List on-demand backups for the table, then delete them
	var lastArn *string
	for {
		out, err := client.ListBackups(ctx, &dynamodb.ListBackupsInput{
			TableName:               aws.String(tableName),
			ExclusiveStartBackupArn: lastArn,
		})
		if err != nil {
			return err
		}
		for _, b := range out.BackupSummaries {
			if b.BackupArn == nil {
				continue
			}
			_, derr := client.DeleteBackup(ctx, &dynamodb.DeleteBackupInput{BackupArn: b.BackupArn})
			if derr != nil {
				// log and continue
				fmt.Printf("warn: delete backup %s: %v\n", aws.ToString(b.BackupArn), derr)
			} else {
				fmt.Printf("deleted backup %s for table %s\n", aws.ToString(b.BackupArn), tableName)
			}
		}
		if out.LastEvaluatedBackupArn == nil || *out.LastEvaluatedBackupArn == "" {
			break
		}
		lastArn = out.LastEvaluatedBackupArn
	}
	return nil
}

func main() {
	lambda.Start(HandleRequest)
}
