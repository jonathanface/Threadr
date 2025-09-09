package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	stripe "github.com/stripe/stripe-go/v79"
	stripesub "github.com/stripe/stripe-go/v79/subscription"
)

func GenerateStoryOutlineSections(typeOf models.OutlineTemplate) []models.OutlineSection {
	var sections []models.OutlineSection
	switch typeOf {
	case models.ThreeAct:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Setup",
			Description: "Introduces the protagonist, world, and central conflict. Generally the first 25% of the book.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Confrontation",
			Description: "Obstacles escalate, character development deepens, and stakes rise. Around 50% of the book should be here.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Resolution",
			Description: "Climax and aftermath of the conflict. 25%.",
		})
	case models.FiveAct:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Exposition",
			Description: "Introduction to the world and protagonist.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Rising Action",
			Description: "Conflict builds, characters react to new challenges.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Climax",
			Description: "The turning point, the moment of greatest tension.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       3,
			Header:      "Falling Action",
			Description: "The consequences of the climax play out.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       4,
			Header:      "Resolution",
			Description: "Loose ends are tied up, and the story concludes.",
		})
	case models.HeroJourney:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Ordinary World",
			Description: "The hero’s starting point.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Call to Adventure",
			Description: "An inciting event disrupts their world.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Refusal of the Call",
			Description: "The hero hesitates.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       3,
			Header:      "Meeting the Mentor",
			Description: "A guide offers wisdom.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       4,
			Header:      "Crossing the Threshold",
			Description: "The hero commits to the journey.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       5,
			Header:      "Tests, Allies, and Enemies",
			Description: "Encounters shape their path.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       6,
			Header:      "Approach to the Innermost Cave",
			Description: "The hero faces their deepest challenge.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       7,
			Header:      "The Ordeal",
			Description: "A life-changing trial or event.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       8,
			Header:      "The Reward",
			Description: "Victory comes with insight or a gift.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       9,
			Header:      "The Road Back",
			Description: "The hero must return home.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       10,
			Header:      "Resurrection",
			Description: "A final test or transformation.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       11,
			Header:      "Return with the Elixir",
			Description: "The hero brings change back to the world.",
		})
	}
	return sections
}

func GetTableSuffix() string {
	currentMode := models.AppMode(strings.ToLower(os.Getenv("MODE")))
	if currentMode != models.ModeProduction {
		return "_staging"
	}
	return ""
}

var awsPrefixPattern = regexp.MustCompile(`(?i)aws:`)
var disallowedTagChars = regexp.MustCompile(`[^A-Za-z0-9 +\-\=\.\_\:\/@]`)

// CleanDynamoTagString removes all characters that are disallowed in a DynamoDB tag key/value.
func CleanDynamoTagString(input string) string {
	withoutAws := awsPrefixPattern.ReplaceAllString(input, "")

	// Step 2: Remove all disallowed characters.
	cleaned := disallowedTagChars.ReplaceAllString(withoutAws, "")

	// Optionally, trim leading/trailing spaces (if desired)
	return strings.TrimSpace(cleaned)
}

func (d *DAO) awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (awsError models.AwsError, err error) {
	if writeItemsInput == nil || len(writeItemsInput.TransactItems) == 0 {
		return awsError, fmt.Errorf("writeItemsInput is nil or empty")
	}

	maxItemsPerSecond := d.capacity / 2
	maxTransactions := 100 // AWS limit for TransactWriteItems

	// **Step 1: Split into chunks of 100 (AWS limit)**
	for i := 0; i < len(writeItemsInput.TransactItems); i += maxTransactions {
		end := i + maxTransactions
		if end > len(writeItemsInput.TransactItems) {
			end = len(writeItemsInput.TransactItems)
		}

		chunk := &dynamodb.TransactWriteItemsInput{
			TransactItems: writeItemsInput.TransactItems[i:end],
		}

		// **Step 2: Retry logic with exponential backoff**
		for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
			_, err := d.DynamoClient.TransactWriteItems(context.Background(), chunk)
			if err == nil {
				break // Success, continue to next chunk
			}

			// Handle AWS transaction-specific errors
			var txnErr *types.TransactionCanceledException
			if errors.As(err, &txnErr) && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if *reason.Code == "ConditionalCheckFailed" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return awsError, nil
					}

					// Handle retryable errors
					if *reason.Code == "TransactionConflict" ||
						*reason.Code == "CapacityExceededException" ||
						*reason.Code == "ResourceInUseException" {

						// Calculate delay for retry
						var delay time.Duration
						if *reason.Code == "CapacityExceededException" {
							delay = time.Duration(float64(time.Second) / float64(maxItemsPerSecond))
						} else {
							delay = time.Duration((1 << uint(numRetries)) * time.Millisecond)
						}

						time.Sleep(delay)
						break // Retry loop
					} else if *reason.Code != "None" {
						awsError.ErrorType = *reason.Code
						awsError.Code = txnErr.ErrorCode()
						awsError.Text = *reason.Message
						return awsError, nil
					}
				}
			} else {
				return models.AwsError{}, err
			}
		}
	}
	return awsError, nil
}

func (d *DAO) generateStoryChapterTransaction(storyID, chapterID, chapterTitle string, chapter int) (types.TransactWriteItem, error) {
	if chapterTitle == "" || storyID == "" || chapterID == "" {
		return types.TransactWriteItem{}, fmt.Errorf("CHAPTER CREATION: storyID, chapterID, and chapterTitle params must not be blank")
	}
	chapterNumStr := strconv.Itoa(chapter)
	attributes := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: storyID},
		"chapter_id":  &types.AttributeValueMemberS{Value: chapterID},
		"chapter_num": &types.AttributeValueMemberN{Value: chapterNumStr},
		"title":       &types.AttributeValueMemberS{Value: chapterTitle},
	}
	input := types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("chapters" + GetTableSuffix()),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(story_id) AND attribute_not_exists(chapter_num)"),
		},
	}
	return input, nil
}

func (d *DAO) checkBackupStatus(arn string) error {
	for {
		describeInput := &dynamodb.DescribeBackupInput{
			BackupArn: aws.String(arn),
		}
		output, err := d.DynamoClient.DescribeBackup(context.Background(), describeInput)
		if err != nil {
			return err
		}

		status := output.BackupDescription.BackupDetails.BackupStatus
		if status == types.BackupStatusAvailable {
			break
		} else if status == types.BackupStatusCreating {
			time.Sleep(10 * time.Second) // Polling interval
		} else {
			return fmt.Errorf("backup creation failed with status: %v", status)
		}
	}
	return nil
}

// Check if a story was "suspended" by an account's subscription not renewing
func (d *DAO) CheckForSuspendedStories(email string) (bool, error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return false, err
	}
	if len(out.Items) > 0 {
		return true, nil
	}
	return false, nil
}

func (d *DAO) createBlockTable(tableName string, tags *[]types.Tag) error {
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

	_, err := d.DynamoClient.CreateTable(context.TODO(), &dynamodb.CreateTableInput{
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
		waiter := dynamodb.NewTableExistsWaiter(d.DynamoClient)
		if err = waiter.Wait(context.TODO(), &dynamodb.DescribeTableInput{
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
			_, err := d.DynamoClient.UpdateContinuousBackups(context.TODO(), pitrInput)
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

		_, err := d.DynamoClient.UpdateContinuousBackups(context.Background(), pitrInput)
		if err != nil {
			fmt.Println("error enabling continuous backups", err)
		}
	}()
	return nil
}

func (d *DAO) WasStoryDeleted(email string, storyTitle string) (bool, error) {
	exists, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND story_title=:s AND attribute_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyTitle},
		},
	})
	if err != nil {
		return false, err
	}
	if len(exists.Items) > 0 {
		return true, nil
	}
	return false, nil
}

// check if passed story is a member of a series
// return series ID if yes, blank if no
func (d *DAO) IsStoryInASeries(email string, storyID string) (string, error) {
	var (
		err   error
		story *models.Story
	)
	story, err = d.GetStoryByID(email, storyID)
	if err != nil {
		return "", err
	}
	return story.SeriesID, nil
}

func (d *DAO) GetTotalCreatedStories(email string) (storiesCount int, err error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return 0, err
	}
	storiesCount = int(out.Count)
	return
}

func (d *DAO) CheckTableStatus(tableName string) (string, error) {
	resp, err := d.DynamoClient.DescribeTable(context.TODO(), &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err != nil {
		return "", err
	}
	return string(resp.Table.TableStatus), nil
}

func (d *DAO) RestoreAutomaticallyDeletedStories(email string) error {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return err
	}

	var stories []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return err
	}
	for _, story := range stories {
		chapterScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("chapters" + GetTableSuffix()),
			FilterExpression: aws.String("attribute_exists(deleted_at) AND story_id = :sid AND attribute_exists(bup_arn)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: story.ID},
			},
			Select: types.SelectAllAttributes,
		}
		chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
		if err != nil {
			return err
		}
		var chapters []models.Chapter
		if err = attributevalue.UnmarshalListOfMaps(chapterOut.Items, &chapters); err != nil {
			return err
		}
		for _, chapter := range chapters {
			if len(chapter.BackupARN) == 0 {
				continue
			}
			oldTableName := story.ID + "_" + chapter.ID + "_blocks" + GetTableSuffix()
			_, err := d.DynamoClient.RestoreTableFromBackup(context.TODO(), &dynamodb.RestoreTableFromBackupInput{
				BackupArn:       aws.String(chapter.BackupARN),
				TargetTableName: aws.String(oldTableName),
			})
			if err != nil {
				return err
			}
			chapterKey := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: chapter.ID},
				"story_id":   &types.AttributeValueMemberS{Value: story.ID},
			}
			chapterUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("chapters" + GetTableSuffix()),
				Key:              chapterKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
			if err != nil {
				return err
			}
		}
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories" + GetTableSuffix()),
			Key:              storyKey,
			UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
		}
		_, err = d.DynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return err
		}

		storyOrSeriesID := story.ID
		if story.SeriesID != "" {
			storyOrSeriesID = story.SeriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: story.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("series" + GetTableSuffix()),
				Key:              seriesKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
			if err != nil {
				return err
			}
		}

		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations" + GetTableSuffix()),
			FilterExpression: aws.String("author = :eml AND attribute_exists(deleted_at) AND automated_deletion = :a AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":a":   &types.AttributeValueMemberBOOL{Value: true},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.DynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("associations" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationUpdateInput)
			if err != nil {
				return err
			}

			associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("association_details" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.DynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (d *DAO) SoftDeleteStory(email, storyID string, automated bool) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Get the story. If not found, return error.
	story, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	seriesID := story.SeriesID
	storyOrSeriesID := storyID
	deletedSeries := false

	var transactItems []types.TransactWriteItem

	// --- Process Chapters ---
	// Scan the "chapters" table for active (not yet deleted) chapters for this story.
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	// For each chapter item, add an Update operation to mark it as deleted.
	for _, item := range chapterOut.Items {
		chapterIDAttr, ok := item["chapter_id"].(*types.AttributeValueMemberS)
		if !ok {
			return errors.New("chapter_id missing or not a string")
		}
		chapterID := chapterIDAttr.Value
		oldTableName := storyID + "_" + chapterID + "_blocks" + GetTableSuffix()

		// Create the BackupTableInput
		input := &dynamodb.CreateBackupInput{
			TableName:  aws.String(oldTableName),
			BackupName: aws.String(oldTableName + "-backup-" + time.Now().Format("2006-01-02-15-04-05")),
		}

		// Create the backup
		buResponse, err := d.DynamoClient.CreateBackup(context.TODO(), input)
		tableNotFound := false
		if err != nil {
			if opErr, ok := err.(*smithy.OperationError); ok {
				var txnErr *types.TableNotFoundException
				if errors.As(opErr.Unwrap(), &txnErr) {
					tableNotFound = true
					fmt.Printf("Table %s not found, skipping", oldTableName)
				}
			}
			if !tableNotFound {
				fmt.Printf("Failed to create backup for table %s, %v", oldTableName, err)
				return err
			}
		}

		backupARN := ""
		if !tableNotFound {
			backupARN = *buResponse.BackupDetails.BackupArn
			err = d.checkBackupStatus(*buResponse.BackupDetails.BackupArn)
			if err != nil {
				return err
			}
			chapterStatus, err := d.CheckTableStatus(oldTableName)
			if err != nil {
				return err
			}
			if chapterStatus != "ACTIVE" {
				time.Sleep(1 * time.Second)
				go d.SoftDeleteStory(email, storyID, automated)
				return nil
			}
			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(oldTableName),
			}

			for numRetries := 0; numRetries < d.maxRetries; numRetries++ {

				if _, err = d.DynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
					if opErr, ok := err.(*smithy.OperationError); ok {
						var useErr *types.ResourceInUseException
						if errors.As(opErr.Unwrap(), &useErr) {
							delay := time.Duration((1 << uint(numRetries)) * (2 * time.Second))
							if numRetries < d.maxRetries-1 {
								fmt.Println("retrying block table deletion in", delay)
								time.Sleep(delay)
								continue
							} else {
								return err
							}
						}
					}
				}
				break
			}
		}

		chapterKey := map[string]types.AttributeValue{
			"chapter_id": &types.AttributeValueMemberS{Value: chapterID},
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
		}
		updateChapter := &types.Update{
			TableName:        aws.String("chapters" + GetTableSuffix()),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a, bup_arn = :barn"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n":    &types.AttributeValueMemberN{Value: now},
				":a":    &types.AttributeValueMemberBOOL{Value: automated},
				":barn": &types.AttributeValueMemberS{Value: backupARN},
			},
		}
		transactItems = append(transactItems, types.TransactWriteItem{
			Update: updateChapter,
		})
	}

	// --- Process Series ---
	// If the story is part of a series, and if the series now has no stories,
	// then update the series item.
	if seriesID != "" {
		series, err := d.GetSeriesByID(email, seriesID)
		if err != nil {
			return err
		}
		if len(series.Stories) == 0 {
			// Use seriesID instead of storyID
			storyOrSeriesID = seriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: seriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdate := &types.Update{
				TableName:        aws.String("series" + GetTableSuffix()),
				Key:              seriesKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: seriesUpdate,
			})
			deletedSeries = true
		}
	}

	// --- Process Associations ---
	// If this story (or series) has associations and either there is no series or the series was deleted,
	// update the associations to mark them as deleted.
	if seriesID == "" || deletedSeries {
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations" + GetTableSuffix()),
			FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at) AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.DynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}
		for _, item := range associationOut.Items {
			assocIDAttr, ok := item["association_id"].(*types.AttributeValueMemberS)
			if !ok {
				return errors.New("association_id missing or not a string")
			}
			assocID := assocIDAttr.Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdate := &types.Update{
				TableName:        aws.String("associations" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: associationUpdate,
			})
			associationDetailsUpdate := &types.Update{
				TableName:        aws.String("association_details" + GetTableSuffix()),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			transactItems = append(transactItems, types.TransactWriteItem{
				Update: associationDetailsUpdate,
			})
		}
	}

	// --- Process Story Update ---
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyUpdate := &types.Update{
		TableName:        aws.String("stories" + GetTableSuffix()),
		Key:              storyKey,
		UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
			":a": &types.AttributeValueMemberBOOL{Value: automated},
		},
	}
	transactItems = append(transactItems, types.TransactWriteItem{
		Update: storyUpdate,
	})

	// Finally, create a TransactWriteItemsInput with all operations.
	transactions := &dynamodb.TransactWriteItemsInput{
		TransactItems: transactItems,
	}
	awsErr, err := d.awsWriteTransaction((transactions))
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) hardDeleteStory(email, storyID string) error {
	originalStory, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("author = :eml AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.DynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	for _, item := range chapterOut.Items {
		chapterID := item["id"].(*types.AttributeValueMemberS)
		// Delete associated tables
		chapterKey := map[string]types.AttributeValue{
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
			"chapter_id": chapterID,
		}
		chapterDeleteInput := &dynamodb.DeleteItemInput{
			TableName: aws.String("chapters" + GetTableSuffix()),
			Key:       chapterKey,
		}
		_, err = d.DynamoClient.DeleteItem(context.Background(), chapterDeleteInput)
		if err != nil {
			return err
		}
	}

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyDeleteInput := &dynamodb.DeleteItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Key:       storyKey,
	}
	_, err = d.DynamoClient.DeleteItem(context.Background(), storyDeleteInput)
	if err != nil {
		return err
	}

	// Delete series
	deletedSeries := false
	storyOrSeriesID := storyID
	if originalStory.SeriesID != "" {
		series, err := d.GetSeriesByID(email, originalStory.SeriesID)
		if err != nil {
			return err
		}
		if len(series.Stories)-1 <= 0 {
			storyOrSeriesID = series.ID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: originalStory.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("series" + GetTableSuffix()),
				Key:       seriesKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), seriesDeleteInput)
			if err != nil {
				return err
			}
			// delete series portrait image from s3
			bucketName := "richdocter-series-portraits"
			parsedPath, err := url.Parse(originalStory.ImageURL)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
			deletedSeries = true
		}
	}

	if originalStory.SeriesID == "" || deletedSeries {

		// Delete associations
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations" + GetTableSuffix()),
			FilterExpression: aws.String("author = :eml AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.DynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("associations" + GetTableSuffix()),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), associationDeleteInput)
			if err != nil {
				return err
			}

			associationDetailsDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("association_details" + GetTableSuffix()),
				Key:       associationKey,
			}
			_, err = d.DynamoClient.DeleteItem(context.Background(), associationDetailsDeleteInput)
			if err != nil {
				return err
			}
			// delete association images
			var bucketName string
			switch item["association_type"].(*types.AttributeValueMemberS).Value {
			case "character":
				bucketName = "richdocterportraits"
			case "event":
				bucketName = "richdocterevents"
			case "location":
				bucketName = "richdocterlocations"
			}
			parsedPath, err := url.Parse(item["portrait"].(*types.AttributeValueMemberS).Value)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
		}
		// delete story portrait image from s3
		bucketName := "richdocter-story-portraits"
		parsedPath, err := url.Parse(originalStory.ImageURL)
		if err != nil {
			return err
		}
		objectKey := path.Base(parsedPath.Path)

		_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
			Bucket: &bucketName,
			Key:    &objectKey,
		})
		if err != nil {
			fmt.Println("DELETE IMAGE ERROR:", err)
		}
	}
	return nil
}

func (d *DAO) AddStripeData(email, subscriptionID, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		Key:              key,
		UpdateExpression: aws.String("set subscription_id=:s, customer_id=:c"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: *subscriptionID},
			":c": &types.AttributeValueMemberS{Value: *customerID},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err := d.DynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		fmt.Println("error saving", err)
		return err
	}
	return nil
}

func (d *DAO) verifyStripeSubscription(subID, customerID string) (SubscriptionStatus, error) {

	normalize := func(s string) string { return strings.TrimSpace(s) }

	subID = normalize(subID)
	customerID = normalize(customerID)

	// 1) Try direct GET if we have a candidate ID
	if subID != "" {
		s, err := stripesub.Get(subID, nil)
		if err == nil {
			return toStatus(s, true), nil
		}
		// Gracefully handle 404 resource_missing
		if se, ok := err.(*stripe.Error); ok && se.Code == stripe.ErrorCodeResourceMissing && se.Param == "id" {
			// fall through to customer lookup if we can
		} else {
			// other errors (auth, network, etc.) bubble up
			return SubscriptionStatus{}, err
		}
	}

	// 2) If we know the customer, try to find their most recent subscription
	if customerID != "" {
		lp := &stripe.SubscriptionListParams{
			Customer: stripe.String(customerID),
			Status:   stripe.String("all"),
		}
		it := stripesub.List(lp)
		var newest *stripe.Subscription
		for it.Next() {
			s := it.Subscription()
			if newest == nil || s.Created > newest.Created {
				newest = s
			}
		}
		if err := it.Err(); err != nil {
			return SubscriptionStatus{}, err
		}
		if newest != nil {
			return toStatus(newest, true), nil
		}
	}

	// 3) Nothing found
	return SubscriptionStatus{Found: false, Active: false, Status: "not_found"}, nil
}
