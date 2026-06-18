package daos

import (
	"context"
	"sort"
	"strconv"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// SuspendExcessAssociations marks the newest associations beyond the
// per-story free cap (models.MaxFreeAssociationsPerStory) with a
// `suspended_at` timestamp. Non-subscriber read paths exclude rows where
// suspended_at exists, so the user keeps seeing their oldest cap-many
// associations per story or series. The function is idempotent — its scan
// already excludes already-suspended rows, so a second run is a no-op.
//
// Called when a subscription lapses (Stripe webhook path and the
// OAuth-discovery path). The corresponding undo is RestoreSuspendedAssociations.
func (d *DAO) SuspendExcessAssociations(ctx context.Context, email string) error {
	logger.Info("SuspendExcessAssociations started", "email", email)

	type assocKey struct {
		AssocID         string
		StoryOrSeriesID string
		CreatedAt       int64
	}
	grouped := make(map[string][]assocKey)

	scanInput := &dynamodb.ScanInput{
		TableName: aws.String("associations" + GetTableSuffix()),
		FilterExpression: aws.String(
			"author = :eml AND attribute_not_exists(deleted_at) AND attribute_not_exists(suspended_at)",
		),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
		Select: types.SelectAllAttributes,
	}

	var lastKey map[string]types.AttributeValue
	for {
		scanInput.ExclusiveStartKey = lastKey
		out, err := d.DynamoClient.Scan(ctx, scanInput)
		if err != nil {
			logger.Error("SuspendExcessAssociations scan failed", "email", email, "error", err)
			return err
		}
		for _, item := range out.Items {
			assocIDAttr, ok := item[attrAssociationID].(*types.AttributeValueMemberS)
			if !ok {
				continue
			}
			sosIDAttr, ok := item[attrStoryOrSeriesID].(*types.AttributeValueMemberS)
			if !ok {
				continue
			}
			var createdAt int64
			if ca, caOK := item["created_at"].(*types.AttributeValueMemberN); caOK {
				createdAt, _ = strconv.ParseInt(ca.Value, 10, 64)
			}
			grouped[sosIDAttr.Value] = append(grouped[sosIDAttr.Value], assocKey{
				AssocID:         assocIDAttr.Value,
				StoryOrSeriesID: sosIDAttr.Value,
				CreatedAt:       createdAt,
			})
		}
		if len(out.LastEvaluatedKey) == 0 {
			break
		}
		lastKey = out.LastEvaluatedKey
	}

	now := strconv.FormatInt(time.Now().Unix(), 10)
	var suspendedCount int
	for sosID, group := range grouped {
		if len(group) <= models.MaxFreeAssociationsPerStory {
			continue
		}
		// Newest first; the first (len-cap) entries are the excess to suspend.
		sort.Slice(group, func(i, j int) bool {
			return group[i].CreatedAt > group[j].CreatedAt
		})
		excess := group[:len(group)-models.MaxFreeAssociationsPerStory]
		for _, a := range excess {
			_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
				TableName: aws.String("associations" + GetTableSuffix()),
				Key: map[string]types.AttributeValue{
					attrAssociationID:   &types.AttributeValueMemberS{Value: a.AssocID},
					attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: a.StoryOrSeriesID},
				},
				UpdateExpression: aws.String("SET suspended_at = :t"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t": &types.AttributeValueMemberN{Value: now},
				},
			})
			if err != nil {
				logger.Error("SuspendExcessAssociations update failed",
					"email", email, "storyOrSeriesId", sosID, "associationId", a.AssocID, "error", err)
				return err
			}
			suspendedCount++
		}
	}

	logger.Info("SuspendExcessAssociations completed",
		"email", email, "groupsProcessed", len(grouped), "suspendedCount", suspendedCount)
	return nil
}

// HasSuspendedAssociations returns true when at least one of email's
// associations currently has suspended_at set. Used to decide whether the
// OAuth-discovery resubscribe path should kick off a restore.
func (d *DAO) HasSuspendedAssociations(ctx context.Context, email string) (bool, error) {
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String("associations" + GetTableSuffix()),
		FilterExpression: aws.String(
			"author = :eml AND attribute_exists(suspended_at)",
		),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return false, err
	}
	return len(out.Items) > 0, nil
}

// RestoreSuspendedAssociations removes the `suspended_at` flag from every
// association owned by email, making them visible to non-subscriber read
// paths again. Called when a previously-lapsed user resubscribes.
func (d *DAO) RestoreSuspendedAssociations(ctx context.Context, email string) error {
	logger.Info("RestoreSuspendedAssociations started", "email", email)

	type assocKey struct {
		AssocID         string
		StoryOrSeriesID string
	}
	var toRestore []assocKey

	scanInput := &dynamodb.ScanInput{
		TableName: aws.String("associations" + GetTableSuffix()),
		FilterExpression: aws.String(
			"author = :eml AND attribute_exists(suspended_at)",
		),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
		Select: types.SelectAllAttributes,
	}

	var lastKey map[string]types.AttributeValue
	for {
		scanInput.ExclusiveStartKey = lastKey
		out, err := d.DynamoClient.Scan(ctx, scanInput)
		if err != nil {
			logger.Error("RestoreSuspendedAssociations scan failed", "email", email, "error", err)
			return err
		}
		for _, item := range out.Items {
			assocIDAttr, ok := item[attrAssociationID].(*types.AttributeValueMemberS)
			if !ok {
				continue
			}
			sosIDAttr, ok := item[attrStoryOrSeriesID].(*types.AttributeValueMemberS)
			if !ok {
				continue
			}
			toRestore = append(toRestore, assocKey{
				AssocID:         assocIDAttr.Value,
				StoryOrSeriesID: sosIDAttr.Value,
			})
		}
		if len(out.LastEvaluatedKey) == 0 {
			break
		}
		lastKey = out.LastEvaluatedKey
	}

	for _, a := range toRestore {
		_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName: aws.String("associations" + GetTableSuffix()),
			Key: map[string]types.AttributeValue{
				attrAssociationID:   &types.AttributeValueMemberS{Value: a.AssocID},
				attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: a.StoryOrSeriesID},
			},
			UpdateExpression: aws.String("REMOVE suspended_at"),
		})
		if err != nil {
			logger.Error("RestoreSuspendedAssociations update failed",
				"email", email, "associationId", a.AssocID, "error", err)
			return err
		}
	}

	logger.Info("RestoreSuspendedAssociations completed",
		"email", email, "restoredCount", len(toRestore))
	return nil
}
