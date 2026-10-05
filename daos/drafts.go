package daos

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"net/url"
	"strconv"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
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

// CurrentDraftID returns the story id that reader-facing paths (share
// links, future dashboards) should serve for the ancestry group that
// storyID belongs to.
//
// Resolution order:
//  1. Resolve storyID to its root.
//  2. If any sibling (including the root itself) has IsCurrentDraft=true,
//     return that sibling's id.
//  3. Otherwise fall back to the root id (handles the case where a current
//     draft was deleted without re-promoting).
//
// v1 uses a filter-expression Scan on the stories table. When the
// original_story_id_index GSI is deployed per docs/drafts.md, swap this
// implementation for a targeted Query by original_story_id to avoid the
// table-size cost.
func (d *DAO) CurrentDraftID(ctx context.Context, storyID string) (string, error) {
	rootID, err := d.RootStoryID(ctx, storyID)
	if err != nil {
		return "", err
	}
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("(original_story_id = :rid OR story_id = :rid) AND is_current_draft = :t AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":rid": &types.AttributeValueMemberS{Value: rootID},
			":t":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return "", err
	}
	var rows []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return "", err
	}
	if len(rows) > 0 {
		return rows[0].ID, nil
	}
	return rootID, nil
}

// StoryOrSeriesID returns the id used to scope associations for a story.
// If the story's root is in a series, returns the series id. Otherwise
// returns the root story id — so all drafts of a root share one
// association list even when the story isn't in a series.
//
// Replaces the per-call-site pattern:
//
//	storyOrSeries, _ := d.IsStoryInASeries(ctx, email, storyID)
//	if storyOrSeries == "" { storyOrSeries = storyID }
//
// which doesn't account for drafts (it would scope to the draft's own id
// instead of the root's).
func (d *DAO) StoryOrSeriesID(ctx context.Context, email, storyID string) (string, error) {
	rootID, err := d.RootStoryID(ctx, storyID)
	if err != nil {
		return "", err
	}
	seriesID, err := d.IsStoryInASeries(ctx, email, rootID)
	if err != nil {
		return "", err
	}
	if seriesID != "" {
		return seriesID, nil
	}
	return rootID, nil
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

// CreateStoryDraft creates a new draft of sourceStoryID. The caller must own
// sourceStoryID. The returned story carries the new story_id, chapter ids,
// and the ancestry metadata (OriginalStoryID points at the root — which is
// either sourceStoryID itself if the source is a root, or sourceStory's root
// if the source is itself a draft).
//
// Deep-clone semantics follow docs/drafts.md:
//   - Story row, chapters, blocks, outline are cloned.
//   - Associations and comments are NOT cloned (shared at root / empty).
//   - IsCurrentDraft is left false; caller must explicitly promote via
//     SetCurrentDraft (not yet implemented in this phase).
//
// Failures mid-clone trigger a best-effort rollback of the new story and
// chapters so no half-populated draft row survives. Block/outline copy
// errors run through the same rollback path.
func (d *DAO) CreateStoryDraft(
	ctx context.Context,
	email, sourceStoryID, draftName string,
) (*models.Story, error) {
	sourceStory, err := d.GetStoryByID(ctx, email, sourceStoryID)
	if err != nil {
		return nil, err
	}

	rootID := sourceStory.ID
	if sourceStory.OriginalStoryID != "" {
		rootID = sourceStory.OriginalStoryID
	}

	newStoryID := uuid.New().String()
	now := strconv.FormatInt(time.Now().Unix(), 10)

	chapterIDMap := make(map[string]string, len(sourceStory.Chapters))
	for _, ch := range sourceStory.Chapters {
		chapterIDMap[ch.ID] = uuid.New().String()
	}

	// Step 1: story row + all chapter rows in a single transaction so we
	// never end up with a draft row that has no chapters.
	storyItem := map[string]types.AttributeValue{
		attrStoryID:         &types.AttributeValueMemberS{Value: newStoryID},
		"author":            &types.AttributeValueMemberS{Value: email},
		"title":             &types.AttributeValueMemberS{Value: sourceStory.Title},
		attrDescription:     &types.AttributeValueMemberS{Value: sourceStory.Description},
		attrCreatedAt:       &types.AttributeValueMemberN{Value: now},
		attrImageURL:        &types.AttributeValueMemberS{Value: sourceStory.ImageURL},
		"original_story_id": &types.AttributeValueMemberS{Value: rootID},
		"draft_name":        &types.AttributeValueMemberS{Value: draftName},
	}
	if sourceStory.SeriesID != "" {
		storyItem[attrSeriesID] = &types.AttributeValueMemberS{Value: sourceStory.SeriesID}
		storyItem["place"] = &types.AttributeValueMemberN{Value: strconv.Itoa(sourceStory.Place)}
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	twii.TransactItems = append(twii.TransactItems, types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("stories" + GetTableSuffix()),
			Item:                storyItem,
			ConditionExpression: aws.String("attribute_not_exists(story_id)"),
		},
	})

	for _, ch := range sourceStory.Chapters {
		chapTwi, cerr := d.generateStoryChapterTransaction(
			newStoryID, chapterIDMap[ch.ID], ch.Title, ch.Place,
		)
		if cerr != nil {
			return nil, cerr
		}
		twii.TransactItems = append(twii.TransactItems, chapTwi)
	}

	awsErr, err := d.awsWriteTransaction(ctx, twii)
	if err != nil {
		return nil, fmt.Errorf("draft clone: story + chapters commit: %w", err)
	}
	if !awsErr.IsNil() {
		return nil, fmt.Errorf("draft clone: story + chapters commit: --AWSERROR-- Code:%s, Type: %s, Message: %s",
			awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	// Step 2: copy blocks for every chapter. Rollback on any failure.
	for _, ch := range sourceStory.Chapters {
		newChapterID := chapterIDMap[ch.ID]
		if err = d.copyChapterBlocks(ctx, sourceStoryID, ch.ID, newStoryID, newChapterID); err != nil {
			d.rollbackDraftClone(ctx, email, newStoryID, chapterIDMap)
			return nil, fmt.Errorf("draft clone: copy blocks for chapter %s: %w", ch.ID, err)
		}
	}

	// Step 3: copy outline rows if any exist. Not fatal if the source has
	// no outline (sql.ErrNoRows path).
	if err = d.copyOutlineRows(ctx, sourceStoryID, newStoryID, chapterIDMap); err != nil {
		d.rollbackDraftClone(ctx, email, newStoryID, chapterIDMap)
		return nil, fmt.Errorf("draft clone: copy outline: %w", err)
	}

	// Build the return value from the source story with the new IDs
	// applied. Handlers can refetch via GetStoryByID if they want the
	// authoritative latest.
	newStory := *sourceStory
	newStory.ID = newStoryID
	newStory.OriginalStoryID = rootID
	newStory.DraftName = draftName
	newStory.IsCurrentDraft = false
	newChapters := make([]models.Chapter, len(sourceStory.Chapters))
	for i, ch := range sourceStory.Chapters {
		newChapters[i] = ch
		newChapters[i].ID = chapterIDMap[ch.ID]
		newChapters[i].StoryID = newStoryID
	}
	newStory.Chapters = newChapters
	return &newStory, nil
}

// copyChapterBlocks copies all blocks under sourceStoryID/sourceChapterID
// into newStoryID/newChapterID, preserving key_id/place/chunk and remapping
// the composite_key.
func (d *DAO) copyChapterBlocks(
	ctx context.Context,
	sourceStoryID, sourceChapterID, newStoryID, newChapterID string,
) error {
	sourceCompositeKey := buildCompositeKey(sourceStoryID, sourceChapterID)
	newCompositeKey := buildCompositeKey(newStoryID, newChapterID)

	paginator := dynamodb.NewQueryPaginator(d.DynamoClient, &dynamodb.QueryInput{
		TableName:              aws.String(GetStoryBlocksTableName()),
		KeyConditionExpression: aws.String("composite_key = :pk AND place >= :zero"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":   &types.AttributeValueMemberS{Value: sourceCompositeKey},
			":zero": &types.AttributeValueMemberN{Value: "0"},
		},
	})

	var puts []types.TransactWriteItem
	for paginator.HasMorePages() {
		page, perr := paginator.NextPage(ctx)
		if perr != nil {
			return perr
		}
		for _, item := range page.Items {
			// Copy the row attribute-for-attribute, then overwrite
			// composite_key and the plain story_id/chapter_id fields so
			// downstream reads see the new chapter.
			cloned := make(map[string]types.AttributeValue, len(item))
			maps.Copy(cloned, item)
			cloned[attrCompositeKey] = &types.AttributeValueMemberS{Value: newCompositeKey}
			cloned[attrStoryID] = &types.AttributeValueMemberS{Value: newStoryID}
			cloned[attrChapterID] = &types.AttributeValueMemberS{Value: newChapterID}
			puts = append(puts, types.TransactWriteItem{
				Put: &types.Put{
					TableName: aws.String(GetStoryBlocksTableName()),
					Item:      cloned,
				},
			})
		}
	}

	if len(puts) == 0 {
		return nil
	}

	txnBatchSize := d.writeBatchSize
	if txnBatchSize == 0 {
		txnBatchSize = defaultTxnBatchSize
	}
	return d.runTransactionBatches(ctx, puts, txnBatchSize,
		"draft clone: copying chapter blocks", newStoryID, newChapterID)
}

// copyOutlineRows copies all outline rows from sourceStoryID to newStoryID,
// remapping chapter IDs inside the per-section 'chapters' StringSet so the
// new outline references the cloned chapters, not the source's.
// Absent outline (sql.ErrNoRows) is not an error.
func (d *DAO) copyOutlineRows(
	ctx context.Context,
	sourceStoryID, newStoryID string,
	chapterIDMap map[string]string,
) error {
	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("outlines" + GetTableSuffix()),
		KeyConditionExpression: aws.String("story_id = :storyID"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":storyID": &types.AttributeValueMemberS{Value: sourceStoryID},
		},
	})
	if err != nil {
		return err
	}
	if len(out.Items) == 0 {
		return nil
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	for _, item := range out.Items {
		cloned := make(map[string]types.AttributeValue, len(item))
		maps.Copy(cloned, item)
		cloned[attrStoryID] = &types.AttributeValueMemberS{Value: newStoryID}
		// Remap chapter references on this section if present.
		if ss, ok := cloned["chapters"].(*types.AttributeValueMemberSS); ok && len(ss.Value) > 0 {
			remapped := make([]string, 0, len(ss.Value))
			for _, src := range ss.Value {
				if dst, found := chapterIDMap[src]; found {
					remapped = append(remapped, dst)
				}
			}
			if len(remapped) > 0 {
				cloned["chapters"] = &types.AttributeValueMemberSS{Value: remapped}
			} else {
				// StringSet cannot be empty — drop the attribute instead.
				delete(cloned, "chapters")
			}
		}
		twii.TransactItems = append(twii.TransactItems, types.TransactWriteItem{
			Put: &types.Put{
				TableName: aws.String("outlines" + GetTableSuffix()),
				Item:      cloned,
			},
		})
	}

	awsErr, err := d.awsWriteTransaction(ctx, twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s",
			awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

// ListDrafts returns all story rows that share an ancestry with storyID
// (the root plus every draft), sorted by created_at ascending so the root
// comes first. Caller is expected to have confirmed ownership of storyID
// before calling. Each returned story has its ancestry fields populated;
// Chapters are left nil (callers hydrate on demand).
func (d *DAO) ListDrafts(
	ctx context.Context,
	email, storyID string,
) ([]*models.Story, error) {
	rootID, err := d.RootStoryID(ctx, storyID)
	if err != nil {
		return nil, err
	}
	// v1 Scan — swap for Query against original_story_id_index GSI per
	// docs/drafts.md once the GSI lands.
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String(
			"author=:eml AND attribute_not_exists(deleted_at) AND (story_id = :rid OR original_story_id = :rid)",
		),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":rid": &types.AttributeValueMemberS{Value: rootID},
		},
	})
	if err != nil {
		return nil, err
	}
	var rows []*models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, err
	}
	// Root first, then drafts by created_at ascending so the UI picker
	// orders deterministically regardless of DynamoDB scan order.
	rootIdx := -1
	for i, r := range rows {
		if r.OriginalStoryID == "" {
			rootIdx = i
			break
		}
	}
	if rootIdx > 0 {
		rows[0], rows[rootIdx] = rows[rootIdx], rows[0]
	}
	if len(rows) > 1 {
		rest := rows[1:]
		for i := 1; i < len(rest); i++ {
			for j := i; j > 0 && rest[j].CreatedAt < rest[j-1].CreatedAt; j-- {
				rest[j], rest[j-1] = rest[j-1], rest[j]
			}
		}
	}
	return rows, nil
}

// SetCurrentDraft promotes targetID to be the current draft of its
// ancestry. In one transaction:
//   - the previously-current row's is_current_draft is set to false,
//   - the target's is_current_draft is set to true,
//   - the previously-current row's series_id (if any) is cleared and
//     applied to the target, so series-filtered views continue to show
//     exactly one member per root.
//
// Caller must have verified ownership of targetID.
func (d *DAO) SetCurrentDraft(ctx context.Context, email, targetID string) error {
	rootID, err := d.RootStoryID(ctx, targetID)
	if err != nil {
		return err
	}
	siblings, err := d.ListDrafts(ctx, email, targetID)
	if err != nil {
		return err
	}

	var current *models.Story
	var target *models.Story
	for _, s := range siblings {
		if s.ID == targetID {
			target = s
		}
		if s.IsCurrentDraft {
			current = s
		}
	}
	if target == nil {
		return ErrStoryNotFound
	}
	// Idempotent: already current.
	if current != nil && current.ID == targetID {
		return nil
	}
	// If no row is currently flagged, treat the root as the implicit current
	// (first-draft-promotion case). The root may have no is_current_draft
	// attribute yet.
	if current == nil {
		for _, s := range siblings {
			if s.OriginalStoryID == "" {
				current = s
				break
			}
		}
	}

	tableName := "stories" + GetTableSuffix()
	tx := &dynamodb.TransactWriteItemsInput{}

	// Clear the previous current. If it had a series_id we're moving the
	// membership to the target; otherwise just flip the flag.
	if current != nil && current.ID != targetID {
		clearUpdate := &types.Update{
			TableName: aws.String(tableName),
			Key: map[string]types.AttributeValue{
				attrStoryID: &types.AttributeValueMemberS{Value: current.ID},
				"author":    &types.AttributeValueMemberS{Value: email},
			},
			UpdateExpression: aws.String("SET is_current_draft = :f REMOVE series_id, #p"),
			ExpressionAttributeNames: map[string]string{
				"#p": "place",
			},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":f": &types.AttributeValueMemberBOOL{Value: false},
			},
		}
		// If the previous current had no series_id, we don't need REMOVE
		// series_id/place to error out — DynamoDB tolerates REMOVE of
		// missing attributes.
		tx.TransactItems = append(tx.TransactItems, types.TransactWriteItem{Update: clearUpdate})
	}

	// Promote the target. If the previous current had series_id/place, copy
	// to target.
	setExpr := "SET is_current_draft = :t"
	exprVals := map[string]types.AttributeValue{
		":t": &types.AttributeValueMemberBOOL{Value: true},
	}
	if current != nil && current.SeriesID != "" {
		setExpr = "SET is_current_draft = :t, series_id = :sid, #p = :place"
		exprVals[":sid"] = &types.AttributeValueMemberS{Value: current.SeriesID}
		exprVals[":place"] = &types.AttributeValueMemberN{Value: strconv.Itoa(current.Place)}
	}
	promoteUpdate := &types.Update{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			attrStoryID: &types.AttributeValueMemberS{Value: targetID},
			"author":    &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression:          aws.String(setExpr),
		ExpressionAttributeValues: exprVals,
	}
	if current != nil && current.SeriesID != "" {
		promoteUpdate.ExpressionAttributeNames = map[string]string{"#p": "place"}
	}
	tx.TransactItems = append(tx.TransactItems, types.TransactWriteItem{Update: promoteUpdate})

	awsErr, err := d.awsWriteTransaction(ctx, tx)
	if err != nil {
		return fmt.Errorf("set current draft: %w", err)
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("set current draft: --AWSERROR-- Code:%s, Type: %s, Message: %s",
			awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	_ = rootID
	return nil
}

// RenameDraft updates the draft_name on a single story row. Does not
// validate ancestry — any owned story row can be renamed, which also lets
// the user label the root (e.g. "Original").
func (d *DAO) RenameDraft(ctx context.Context, email, storyID, newName string) error {
	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			attrStoryID: &types.AttributeValueMemberS{Value: storyID},
			"author":    &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET draft_name = :n"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberS{Value: newName},
		},
	})
	return err
}

// rollbackDraftClone deletes the new story row, chapter rows, and any
// blocks already copied to the new chapters. Best-effort — any error here
// is logged, not returned, because the caller is already surfacing the
// original clone error.
func (d *DAO) rollbackDraftClone(
	ctx context.Context,
	email, newStoryID string,
	chapterIDMap map[string]string,
) {
	// Delete new chapters.
	for _, newChID := range chapterIDMap {
		_, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
			TableName: aws.String("chapters" + GetTableSuffix()),
			Key: map[string]types.AttributeValue{
				attrStoryID:   &types.AttributeValueMemberS{Value: newStoryID},
				attrChapterID: &types.AttributeValueMemberS{Value: newChID},
			},
		})
		if err != nil {
			logger.Error("draft clone rollback: delete chapter",
				"storyId", newStoryID, "chapterId", newChID, "error", err)
		}
		// Delete any blocks that may have landed under this chapter.
		if err := d.deleteAllBlocksForChapter(ctx, buildCompositeKey(newStoryID, newChID)); err != nil {
			logger.Error("draft clone rollback: delete blocks",
				"storyId", newStoryID, "chapterId", newChID, "error", err)
		}
	}
	// Delete the new story row.
	_, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String("stories" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			attrStoryID: &types.AttributeValueMemberS{Value: newStoryID},
			"author":    &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("draft clone rollback: delete story",
			"storyId", newStoryID, "error", err)
	}
}
