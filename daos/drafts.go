package daos

import (
	"context"
	"errors"
	"net/url"

	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// ErrStoryNotFound is returned when a draft/story lookup finds no matching row.
// Callers rely on this error identity so share-link readers get a 404 instead
// of a generic 500.
var ErrStoryNotFound = errors.New("story not found")

// getStoryByIDUnscoped reads a story row by id without filtering on author.
// Needed by paths that don't have an authenticated author binding — notably
// the share-link reader path and the drafts root-resolution logic that may
// cross author boundaries if a draft is referenced from a shared context.
// Author-aware reads should still use GetStoryByID.
func (d *DAO) getStoryByIDUnscoped(ctx context.Context, storyID string) (*models.Story, error) {
	decoded, err := url.QueryUnescape(storyID)
	if err != nil {
		return nil, err
	}
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("story_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: decoded},
		},
	})
	if err != nil {
		return nil, err
	}
	var rows []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrStoryNotFound
	}
	return &rows[0], nil
}

// RootStoryID resolves any story id to the id of the root in its drafts
// ancestry. If the given id is already a root (no OriginalStoryID), it is
// returned unchanged.
//
// Used by any read path whose data should be shared across all drafts of
// the same story — associations, share-link resolution, series membership.
// The lookup is a single stories-table read; add in-process caching if
// profiling later shows it matters, but v1 keeps it stateless.
func (d *DAO) RootStoryID(ctx context.Context, storyID string) (string, error) {
	story, err := d.getStoryByIDUnscoped(ctx, storyID)
	if err != nil {
		return "", err
	}
	if story.OriginalStoryID != "" {
		return story.OriginalStoryID, nil
	}
	return story.ID, nil
}
