package daos

import (
	"RichDocter/models"
	"context"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

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

func (d *DAO) kickoffRestoreAsync(email string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		evCh, err := d.RestoreAutomaticallyDeletedStories(ctx, email)
		if err != nil {
			log.Printf("restore: start error for %s: %v", email, err)
			return
		}
		for ev := range evCh {
			if ev.Err != nil {
				log.Printf("restore: story %s failed: %v", ev.StoryID, ev.Err)
			} else {
				log.Printf("restore: story %s (%d/%d) OK", ev.StoryID, ev.Index+1, ev.Total)
			}
		}
	}()
}

func (d *DAO) RestoreAutomaticallyDeletedStories(ctx context.Context, email string) (<-chan RestoreStoryEvent, error) {
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String("stories" + GetTableSuffix()), FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"), ExpressionAttributeValues: map[string]types.AttributeValue{":eml": &types.AttributeValueMemberS{Value: email}, ":a": &types.AttributeValueMemberBOOL{Value: true}}})
	if err != nil {
		return nil, err
	}
	var stories []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return nil, err
	}
	ch := make(chan RestoreStoryEvent, 8) // small buffer helps if receiver does light work
	total := len(stories)
	go func() {
		defer close(ch)
		for i, story := range stories {
			story.Inactive = true
			_, err := d.EditStory(email, story)
			select {
			case <-ctx.Done():
				return
			default:
			}
			log.Println("Starting restore on story", story.Title)
			err = d.restoreOneStory(email, story)
			ev := RestoreStoryEvent{Index: i, Total: total, StoryID: story.ID, Err: err}
			select {
			case ch <- ev:
			case <-ctx.Done():
				return
			}
		}
	}()
	return ch, nil
}

func (d *DAO) ensureBlocksTableFromBackup(
	ctx context.Context,
	backupARN, tableName, chapterName string,
) error {
	// 1) If table exists, wait for ACTIVE and return
	_, err := d.DynamoClient.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err == nil {
		log.Println("waiting for table status")
		return waitForTableStatus(ctx, d.DynamoClient, tableName, chapterName, "ACTIVE", 10*time.Minute)
	}
	if !isResourceNotFound(err) && err != nil {
		return err
	}

	// 2) Not found → try to restore
	_, err = d.DynamoClient.RestoreTableFromBackup(ctx, &dynamodb.RestoreTableFromBackupInput{
		BackupArn:       aws.String(backupARN),
		TargetTableName: aws.String(tableName),
	})
	if err != nil {
		// If another attempt already created/is creating it, just wait
		if !(isTableInUse(err) || isTableAlreadyExists(err)) {
			return err
		}
	}

	// 3) Either we kicked it off or someone else did; wait until ACTIVE
	return waitForTableStatus(ctx, d.DynamoClient, tableName, chapterName, "ACTIVE", 10*time.Minute)
}

func (d *DAO) restoreOneStory(email string, story models.Story) error {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Minute)
	defer cancel()
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters" + GetTableSuffix()),
		FilterExpression: aws.String("attribute_exists(deleted_at) AND story_id = :sid AND attribute_exists(bup_arn)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: story.ID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.DynamoClient.Scan(ctx, chapterScanInput)
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
		if len(chapter.BackupARN) > 0 {
			if err := d.ensureBlocksTableFromBackup(ctx, chapter.BackupARN, oldTableName, chapter.Title); err != nil {
				return err // only real errors bubble up; races are absorbed
			}
		} else {
			fmt.Printf("no backup arn for chapter: %s\n", chapter.ID)
		}

		chapterUpdateInput := &dynamodb.UpdateItemInput{
			TableName: aws.String("chapters" + GetTableSuffix()),
			Key: map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: chapter.ID},
				"story_id":   &types.AttributeValueMemberS{Value: story.ID},
			},
			UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
		}
		_, err = d.DynamoClient.UpdateItem(ctx, chapterUpdateInput)
		if err != nil {
			fmt.Printf("failed to update deletion flag for chapter: %s\n", chapter.ID)
		}
	}
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: story.ID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	finCtx, finCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer finCancel()
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		Key:              storyKey,
		UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
	}
	_, err = d.DynamoClient.UpdateItem(finCtx, storyUpdateInput)
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
		_, err = d.DynamoClient.UpdateItem(finCtx, seriesUpdateInput)
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
	associationOut, err := d.DynamoClient.Scan(finCtx, associationScanInput)
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
		_, err = d.DynamoClient.UpdateItem(finCtx, associationUpdateInput)
		if err != nil {
			return err
		}

		associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("association_details" + GetTableSuffix()),
			Key:              associationKey,
			UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
		}
		_, err = d.DynamoClient.UpdateItem(finCtx, associationDetailsUpdateInput)
		if err != nil {
			return err
		}
	}

	return nil
}
