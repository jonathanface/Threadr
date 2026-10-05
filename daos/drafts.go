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

// Draft row attribute names — kept in one place so the typo check lands here
// instead of at a random DynamoDB filter that silently returns empty results.
const (
	attrOriginalStoryID = "original_story_id"
	exprStoryID         = ":storyID"
	// originalStoryIDIndex is the GSI on the stories table partitioned by
	// original_story_id with sort key created_at. Required for every ancestry
	// query path (CurrentDraftID, ListDrafts). See docs/drafts.md.
	originalStoryIDIndex = "original_story_id_index"
	// attrChaptersSet is the per-outline-section StringSet of chapter IDs
	// assigned to that section. Not the chapters table name.
	attrChaptersSet = "chapters"
)

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
//  2. Query the original_story_id_index GSI for a draft of that root with
//     is_current_draft=true. If found, return it.
//  3. Otherwise return the root id. The root is the default-current when
//     no draft has been explicitly promoted (and when the current draft
//     was deleted without re-promotion).
//
// Note: only draft rows have an original_story_id attribute, so the GSI
// Query returns drafts only. The root itself is not in the GSI; it's
// handled by the fallback.
func (d *DAO) CurrentDraftID(ctx context.Context, storyID string) (string, error) {
	rootID, err := d.RootStoryID(ctx, storyID)
	if err != nil {
		return "", err
	}
	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("stories" + GetTableSuffix()),
		IndexName:              aws.String(originalStoryIDIndex),
		KeyConditionExpression: aws.String("original_story_id = :rid"),
		FilterExpression:       aws.String("is_current_draft = :t AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":rid": &types.AttributeValueMemberS{Value: rootID},
			":t":   &types.AttributeValueMemberBOOL{Value: true},
		},
		Limit: aws.Int32(1),
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
		attrOriginalStoryID: &types.AttributeValueMemberS{Value: rootID},
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
			exprStoryID: &types.AttributeValueMemberS{Value: sourceStoryID},
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
		if ss, ok := cloned[attrChaptersSet].(*types.AttributeValueMemberSS); ok && len(ss.Value) > 0 {
			remapped := make([]string, 0, len(ss.Value))
			for _, src := range ss.Value {
				if dst, found := chapterIDMap[src]; found {
					remapped = append(remapped, dst)
				}
			}
			if len(remapped) > 0 {
				cloned[attrChaptersSet] = &types.AttributeValueMemberSS{Value: remapped}
			} else {
				// StringSet cannot be empty — drop the attribute instead.
				delete(cloned, attrChaptersSet)
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
// (the root plus every draft), sorted root-first then drafts by
// created_at ascending so the UI picker is deterministic. Caller is
// expected to have confirmed ownership of storyID before calling. Each
// returned story has its ancestry fields populated; Chapters are left
// nil (callers hydrate on demand).
func (d *DAO) ListDrafts(
	ctx context.Context,
	email, storyID string,
) ([]*models.Story, error) {
	rootID, err := d.RootStoryID(ctx, storyID)
	if err != nil {
		return nil, err
	}
	// Pull the drafts via the original_story_id_index GSI. The GSI's sort
	// key is created_at so results come back oldest-first without an
	// explicit sort. The root row itself has no original_story_id and is
	// not in the GSI — we fetch it separately below.
	draftsOut, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("stories" + GetTableSuffix()),
		IndexName:              aws.String(originalStoryIDIndex),
		KeyConditionExpression: aws.String("original_story_id = :rid"),
		FilterExpression:       aws.String("author = :eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":rid": &types.AttributeValueMemberS{Value: rootID},
			":eml": &types.AttributeValueMemberS{Value: email},
		},
		ScanIndexForward: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	var drafts []*models.Story
	if err = attributevalue.UnmarshalListOfMaps(draftsOut.Items, &drafts); err != nil {
		return nil, err
	}

	// Fetch the root. GetStoryByID is author-scoped so it doubles as an
	// ownership check for the ancestry.
	root, err := d.GetStoryByID(ctx, email, rootID)
	if err != nil {
		// If the root is missing (e.g. soft-deleted), still return the
		// drafts we found so the caller can detect the broken-ancestry
		// case rather than surfacing a misleading not-found error.
		if errors.Is(err, ErrStoryNotFound) {
			return drafts, nil
		}
		return nil, err
	}
	// Strip chapters from the root so the shape matches the draft rows the
	// GSI query returned (chapters are hydrated on demand per the doc
	// comment).
	rootCopy := *root
	rootCopy.Chapters = nil
	return append([]*models.Story{&rootCopy}, drafts...), nil
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

// PromoteNewRoot migrates an ancestry away from oldRootID so that the old
// root can be deleted without orphaning the remaining drafts. Picks a
// target draft T (preferring the current draft; falling back to the
// oldest remaining draft) and in a single stories-table transaction:
//
//   - clears T.original_story_id (T becomes a root) and sets
//     T.is_current_draft = true,
//   - rewrites every other sibling draft's original_story_id from
//     oldRootID to T.id so the ancestry remains navigable.
//
// After the stories-table transaction commits, best-effort migrations
// move associations (both associations + association_details tables,
// since story_or_series_id is a sort key and must be rewritten via
// delete-then-put) and share_links (via UpdateItem on the PK=token row,
// since story_id is a non-key attribute there) from oldRootID to T.id.
// These happen outside the main transaction; if they fail they are
// logged and the caller continues — the ancestry is already consistent
// and a repair pass can rekey the remaining data.
//
// Returns the id of the new root (T.id). Callers must have confirmed
// ownership of oldRootID; this method does not re-check.
func (d *DAO) PromoteNewRoot(ctx context.Context, email, oldRootID string) (string, error) {
	oldRoot, err := d.getStoryByIDUnscoped(ctx, oldRootID)
	if err != nil {
		return "", err
	}
	if oldRoot.OriginalStoryID != "" {
		return "", errors.New("PromoteNewRoot: given story is not a root")
	}

	siblings, err := d.ListDrafts(ctx, email, oldRootID)
	if err != nil {
		return "", err
	}
	// siblings always starts with the root (if present); need at least one
	// additional entry — i.e. an actual draft — for promotion to make sense.
	const minAncestryForPromotion = 2
	if len(siblings) < minAncestryForPromotion {
		return "", errors.New("PromoteNewRoot: no drafts to promote")
	}

	// Pick target: current draft if any, else oldest non-root (ListDrafts
	// returns drafts in oldest-first order after the root).
	var target *models.Story
	for _, s := range siblings {
		if s.ID == oldRootID {
			continue
		}
		if s.IsCurrentDraft {
			target = s
			break
		}
	}
	if target == nil {
		for _, s := range siblings {
			if s.ID != oldRootID {
				target = s
				break
			}
		}
	}

	tableName := "stories" + GetTableSuffix()
	tx := &dynamodb.TransactWriteItemsInput{}

	// Promote: clear original_story_id, mark current.
	tx.TransactItems = append(tx.TransactItems, types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String(tableName),
			Key: map[string]types.AttributeValue{
				attrStoryID: &types.AttributeValueMemberS{Value: target.ID},
				"author":    &types.AttributeValueMemberS{Value: email},
			},
			UpdateExpression: aws.String("SET is_current_draft = :t REMOVE original_story_id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":t": &types.AttributeValueMemberBOOL{Value: true},
			},
		},
	})

	// Re-parent every other draft onto the new root.
	for _, s := range siblings {
		if s.ID == oldRootID || s.ID == target.ID {
			continue
		}
		tx.TransactItems = append(tx.TransactItems, types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String(tableName),
				Key: map[string]types.AttributeValue{
					attrStoryID: &types.AttributeValueMemberS{Value: s.ID},
					"author":    &types.AttributeValueMemberS{Value: email},
				},
				UpdateExpression: aws.String("SET original_story_id = :tid"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":tid": &types.AttributeValueMemberS{Value: target.ID},
				},
			},
		})
	}

	awsErr, err := d.awsWriteTransaction(ctx, tx)
	if err != nil {
		return "", fmt.Errorf("PromoteNewRoot: %w", err)
	}
	if !awsErr.IsNil() {
		return "", fmt.Errorf("PromoteNewRoot: --AWSERROR-- Code:%s, Type:%s, Message:%s",
			awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	// Best-effort data migrations outside the main transaction.
	// Associations only need to move if the ancestry wasn't in a series —
	// in-series ancestries key associations by series_id, which doesn't
	// change.
	seriesID, serr := d.IsStoryInASeries(ctx, email, oldRootID)
	if serr != nil {
		logger.Warn("PromoteNewRoot: series check failed",
			"oldRoot", oldRootID, "error", serr)
	} else if seriesID == "" {
		if assocErr := d.rekeyAssociationsForNewRoot(ctx, oldRootID, target.ID); assocErr != nil {
			logger.Warn("PromoteNewRoot: association rekey failed",
				"oldRoot", oldRootID, "newRoot", target.ID, "error", assocErr)
		}
	}

	if linkErr := d.rekeyShareLinksForNewRoot(ctx, oldRootID, target.ID); linkErr != nil {
		logger.Warn("PromoteNewRoot: share link rekey failed",
			"oldRoot", oldRootID, "newRoot", target.ID, "error", linkErr)
	}

	return target.ID, nil
}

// rekeyAssociationsForNewRoot rewrites every association row keyed by
// story_or_series_id = oldRootID so it is instead keyed by newRootID.
// story_or_series_id is the sort key, so this is a delete-then-put, done
// as a single TransactWriteItems batch (bounded by the number of
// associations per root). Also migrates the matching association_details
// row for each association.
func (d *DAO) rekeyAssociationsForNewRoot(ctx context.Context, oldRootID, newRootID string) error {
	assocTable := "associations" + GetTableSuffix()
	detailsTable := "association_details" + GetTableSuffix()

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(assocTable),
		IndexName:              aws.String("story-or-series-id-index"),
		KeyConditionExpression: aws.String("story_or_series_id = :s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: oldRootID},
		},
	})
	if err != nil {
		return err
	}
	if len(out.Items) == 0 {
		return nil
	}

	var items []types.TransactWriteItem
	for _, item := range out.Items {
		aid, aidOK := item[attrAssociationID].(*types.AttributeValueMemberS)
		if !aidOK {
			continue
		}
		oldKey := map[string]types.AttributeValue{
			attrAssociationID:   aid,
			attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: oldRootID},
		}
		newItem := make(map[string]types.AttributeValue, len(item))
		maps.Copy(newItem, item)
		newItem[attrStoryOrSeriesID] = &types.AttributeValueMemberS{Value: newRootID}

		items = append(items,
			types.TransactWriteItem{Delete: &types.Delete{TableName: aws.String(assocTable), Key: oldKey}},
			types.TransactWriteItem{Put: &types.Put{TableName: aws.String(assocTable), Item: newItem}},
		)

		// Also move the association_details row if it exists (no GSI on
		// story_or_series_id there, but we have the association_id and
		// can read by composite key).
		detailOut, derr := d.DynamoClient.GetItem(ctx, &dynamodb.GetItemInput{
			TableName: aws.String(detailsTable),
			Key: map[string]types.AttributeValue{
				attrAssociationID:   aid,
				attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: oldRootID},
			},
		})
		if derr != nil || detailOut.Item == nil {
			continue
		}
		newDetail := make(map[string]types.AttributeValue, len(detailOut.Item))
		maps.Copy(newDetail, detailOut.Item)
		newDetail[attrStoryOrSeriesID] = &types.AttributeValueMemberS{Value: newRootID}
		items = append(
			items,
			types.TransactWriteItem{
				Delete: &types.Delete{TableName: aws.String(detailsTable), Key: map[string]types.AttributeValue{
					attrAssociationID:   aid,
					attrStoryOrSeriesID: &types.AttributeValueMemberS{Value: oldRootID},
				}},
			},
			types.TransactWriteItem{Put: &types.Put{TableName: aws.String(detailsTable), Item: newDetail}},
		)
	}

	if len(items) == 0 {
		return nil
	}
	return d.runTransactionBatches(ctx, items, defaultTxnBatchSize,
		"promote: rekey associations", oldRootID, "")
}

// rekeyShareLinksForNewRoot updates every share-link row that still
// references oldRootID in its story_id attribute so it points at
// newRootID. share_links has PK=token with story_id as a non-key
// attribute, so UpdateItem by token (looked up via the story_id-index
// GSI) is sufficient — no delete+put dance.
func (d *DAO) rekeyShareLinksForNewRoot(ctx context.Context, oldRootID, newRootID string) error {
	linksTable := "share_links" + GetTableSuffix()
	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(linksTable),
		IndexName:              aws.String("story_id-index"),
		KeyConditionExpression: aws.String("story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: oldRootID},
		},
	})
	if err != nil {
		return err
	}
	for _, item := range out.Items {
		tok, ok := item["token"].(*types.AttributeValueMemberS)
		if !ok {
			continue
		}
		_, uerr := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:        aws.String(linksTable),
			Key:              map[string]types.AttributeValue{"token": tok},
			UpdateExpression: aws.String("SET story_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: newRootID},
			},
		})
		if uerr != nil {
			logger.Warn("share_link update during promotion failed",
				"token", tok.Value, "error", uerr)
		}
	}
	return nil
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
		if blockErr := d.deleteAllBlocksForChapter(ctx, buildCompositeKey(newStoryID, newChID)); blockErr != nil {
			logger.Error("draft clone rollback: delete blocks",
				"storyId", newStoryID, "chapterId", newChID, "error", blockErr)
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
