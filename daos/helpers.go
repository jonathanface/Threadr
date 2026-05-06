package daos

import (
	"context"
	"errors"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

// hardDeleteStoryAssociations scans the associations table for everything
// owned by email under storyOrSeriesID and hard-deletes each row, its
// association_details row, and its portrait image from S3.
func (d *DAO) hardDeleteStoryAssociations(ctx context.Context, email, storyOrSeriesID string) error {
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("associations" + GetTableSuffix()),
		FilterExpression: aws.String("author = :eml AND story_or_series_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
		},
		Select: types.SelectAllAttributes,
	})
	if err != nil {
		logger.Error("Failed to scan associations for hard delete",
			"error", err, "email", email, "storyOrSeriesId", storyOrSeriesID)
		return err
	}
	logger.Info("Found associations to hard delete",
		"email", email, "storyOrSeriesId", storyOrSeriesID, "associationCount", len(out.Items))

	for _, item := range out.Items {
		if err = d.hardDeleteAssociation(ctx, item, storyOrSeriesID); err != nil {
			return err
		}
	}
	return nil
}

// hardDeleteAssociation deletes a single association row, its details row,
// and its portrait image from S3. Type-assert misses (missing required
// attributes) cause silent skips. DDB delete failures and URL parse failures
// propagate; S3 delete failures are logged best-effort.
func (d *DAO) hardDeleteAssociation(
	ctx context.Context,
	item map[string]types.AttributeValue,
	storyOrSeriesID string,
) error {
	assocAttr, ok := item[attrAssociationID].(*types.AttributeValueMemberS)
	if !ok {
		return nil
	}
	assocID := assocAttr.Value
	associationKey := map[string]types.AttributeValue{
		attrAssociationID:   &types.AttributeValueMemberS{Value: assocID},
		attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: storyOrSeriesID},
	}
	if _, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String("associations" + GetTableSuffix()),
		Key:       associationKey,
	}); err != nil {
		return err
	}
	if _, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String("association_details" + GetTableSuffix()),
		Key:       associationKey,
	}); err != nil {
		return err
	}

	typeAttr, typeOK := item["association_type"].(*types.AttributeValueMemberS)
	if !typeOK {
		return nil
	}
	bucketName := associationImageBucket(typeAttr.Value)
	portraitAttr, portraitOK := item["portrait"].(*types.AttributeValueMemberS)
	if !portraitOK {
		return nil
	}
	parsedPath, parseErr := url.Parse(portraitAttr.Value)
	if parseErr != nil {
		return parseErr
	}
	objectKey := path.Base(parsedPath.Path)
	if _, err := d.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &bucketName,
		Key:    &objectKey,
	}); err != nil {
		logger.Error("Failed to delete association image from S3",
			"error", err, "bucket", bucketName, "objectKey", objectKey, "associationId", assocID)
	}
	return nil
}

// associationImageBucket maps an association_type attribute value to the
// S3 bucket holding that type's portrait images. Returns "" for unknown
// types (callers may still attempt the S3 delete and log the failure).
func associationImageBucket(assocType string) string {
	switch assocType {
	case associationTypeCharacter:
		return "richdocterportraits"
	case "event":
		return "richdocterevents"
	case "location":
		return "richdocterlocations"
	}
	return ""
}

// deleteStoryPortrait removes the story-portrait image referenced by
// imageURL from S3. URL-parse failures propagate; S3 delete failures are
// logged best-effort.
func (d *DAO) deleteStoryPortrait(ctx context.Context, imageURL, storyID string) error {
	bucketName := "richdocter-story-portraits"
	parsedPath, err := url.Parse(imageURL)
	if err != nil {
		logger.Error("Failed to parse story image URL",
			"error", err, "storyId", storyID, "imageUrl", imageURL)
		return err
	}
	objectKey := path.Base(parsedPath.Path)
	if _, err = d.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &bucketName,
		Key:    &objectKey,
	}); err != nil {
		logger.Error("Failed to delete story portrait from S3",
			"error", err, "bucket", bucketName, "objectKey", objectKey, "storyId", storyID)
	}
	return nil
}

// resolveChunkUpdate decides what value to write for the "chunk" attribute
// when updating an existing block. It preserves existing content if the
// incoming chunk is empty or detectably malformed (Lexical paragraphs are
// ~100+ chars of structured JSON; bare "null"/"[]"/"{}" or short content
// without "type" markers indicates a serialization bug, not an intentional
// empty paragraph). Returns nil if the chunk attribute should be left unset
// (incoming is empty AND no existing chunk).
func resolveChunkUpdate(
	incomingChunk []byte,
	existingItem map[string]types.AttributeValue,
	storyID, chapterID, keyID string,
) types.AttributeValue {
	existingChunk, hasExisting := existingItem["chunk"]

	if len(incomingChunk) == 0 {
		if !hasExisting {
			return nil
		}
		logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk due to zero-length incoming chunk",
			"storyId", storyID, "chapterId", chapterID, "keyId", keyID)
		return existingChunk
	}

	chunkStr := string(incomingChunk)
	if !hasExisting {
		return &types.AttributeValueMemberS{Value: chunkStr}
	}

	existingChunkStr := ""
	if s, ok := existingChunk.(*types.AttributeValueMemberS); ok {
		existingChunkStr = s.Value
	}
	if len(existingChunkStr) > minLexicalChunkSize && isMalformedChunk(chunkStr) {
		logger.Warn("DATA LOSS PREVENTED: Preserving existing chunk - incoming chunk is malformed",
			"storyId", storyID, "chapterId", chapterID, "keyId", keyID,
			"existingLength", len(existingChunkStr),
			"incomingLength", len(chunkStr),
			"incomingChunk", chunkStr,
			"existingChunkPreview", truncateString(existingChunkStr, chunkPreviewLength))
		return existingChunk
	}
	return &types.AttributeValueMemberS{Value: chunkStr}
}

// isMalformedChunk returns true for chunk strings that look like serialization
// bugs (race-condition artifacts) rather than valid Lexical JSON.
func isMalformedChunk(chunkStr string) bool {
	switch chunkStr {
	case "null", "[]", `""`, "{}":
		return true
	}
	hasType := strings.Contains(chunkStr, "type")
	hasKeyID := strings.Contains(chunkStr, "key_id")
	if !hasType && !hasKeyID {
		return true
	}
	const shortChunkThreshold = 30
	return len(chunkStr) < shortChunkThreshold && (!hasType || !hasKeyID)
}

// applySeriesChange handles the cascade when a story is moved between series
// (or assigned to/removed from one). Splits the original EditStory branch by
// destination: assigning to a series vs. clearing one. Mutates updatedStory
// and the DDB attribute map `item` in place.
func (d *DAO) applySeriesChange(
	ctx context.Context,
	email string,
	story models.Story,
	storedStory *models.Story,
	updatedStory *models.Story,
	item map[string]types.AttributeValue,
) error {
	if story.SeriesID != "" {
		return d.assignStoryToSeries(ctx, email, story, updatedStory, item)
	}
	return d.clearStorySeries(ctx, email, storedStory, updatedStory)
}

// assignStoryToSeries resolves story.SeriesID (which arrives as either an
// existing series ID or a fresh series-name string) to a real series row,
// creating one if needed, then mutates updatedStory + item to point at it.
func (d *DAO) assignStoryToSeries(
	ctx context.Context,
	email string,
	story models.Story,
	updatedStory *models.Story,
	item map[string]types.AttributeValue,
) error {
	series, err := d.GetSeriesByID(ctx, email, story.SeriesID)
	var seriesID string
	switch {
	case err == nil:
		seriesID = series.ID
		if len(series.Stories) > 1 {
			sort.Slice(series.Stories, func(i, j int) bool {
				return series.Stories[i].Place > series.Stories[j].Place
			})
		} else if len(series.Stories) == 1 {
			updatedStory.Place = series.Stories[0].Place + 1
		}
	case errors.Is(err, ErrSeriesNotFound):
		// Treat story.SeriesID as a new-series title; mint a fresh series.
		updatedStory.Place = 1
		seriesID = uuid.New().String()
		if err = d.putNewSeries(ctx, email, seriesID, story.SeriesID); err != nil {
			return err
		}
	default:
		return err
	}
	item[attrSeriesID] = &types.AttributeValueMemberS{Value: seriesID}
	item["place"] = &types.AttributeValueMemberN{Value: strconv.Itoa(updatedStory.Place)}
	updatedStory.SeriesID = seriesID
	return nil
}

// clearStorySeries handles the case where the caller is removing a story from
// its previous series (story.SeriesID == "" but storedStory.SeriesID != "").
// Original code probed GetSeriesByID with the empty string, relied on the
// resulting NotFound to fall through to the "remove from stored series" path,
// and contained dead code under `else if story.SeriesID != ""`. Behavior is
// preserved literally: do the empty-string lookup, on NotFound rewrite the
// stored series's stories list to drop this one and zero out place; on any
// other error, propagate.
func (d *DAO) clearStorySeries(
	ctx context.Context,
	email string,
	storedStory *models.Story,
	updatedStory *models.Story,
) error {
	_, err := d.GetSeriesByID(ctx, email, "")
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrSeriesNotFound) {
		return err
	}
	storedSeries, err := d.GetSeriesByID(ctx, email, storedStory.SeriesID)
	if err != nil {
		return err
	}
	var newStories []*models.Story
	for _, seriesStory := range storedSeries.Stories {
		if seriesStory.ID != updatedStory.ID {
			newStories = append(newStories, seriesStory)
		}
	}
	storedSeries.Stories = newStories
	if _, err = d.EditSeries(ctx, email, *storedSeries); err != nil {
		return err
	}
	updatedStory.Place = 0
	return nil
}

// putNewSeries writes a fresh series row keyed by the supplied seriesID,
// using the supplied title. Used when EditStory needs to mint a series for
// a story that's joining one for the first time.
func (d *DAO) putNewSeries(ctx context.Context, email, seriesID, title string) error {
	seriesItem := map[string]types.AttributeValue{
		attrSeriesID: &types.AttributeValueMemberS{Value: seriesID},
		"title":      &types.AttributeValueMemberS{Value: title},
		"author":     &types.AttributeValueMemberS{Value: email},
	}
	_, err := d.DynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String("series" + GetTableSuffix()),
		Item:      seriesItem,
	})
	return err
}
