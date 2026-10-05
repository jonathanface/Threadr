package daos

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// scanOutputForStory returns a single-row Scan output representing a stories
// table row for id, optionally with originalID set (empty = root row).
func scanOutputForStory(id, originalID string) *dynamodb.ScanOutput {
	item := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: id},
		"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
	}
	if originalID != "" {
		item["original_story_id"] = &types.AttributeValueMemberS{Value: originalID}
	}
	return &dynamodb.ScanOutput{
		Items: []map[string]types.AttributeValue{item},
	}
}

func TestRootStoryID_RootResolvesToSelf(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("root-abc", ""), nil
	}

	got, err := mockDao.RootStoryID(context.Background(), "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("root should resolve to self, got %q want %q", got, "root-abc")
	}
}

func TestRootStoryID_ChildResolvesToParent(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("child-xyz", "root-abc"), nil
	}

	got, err := mockDao.RootStoryID(context.Background(), "child-xyz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("child should resolve to parent, got %q want %q", got, "root-abc")
	}
}

func TestRootStoryID_UnknownStoryReturnsNotFound(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return &dynamodb.ScanOutput{Items: nil}, nil
	}

	_, err := mockDao.RootStoryID(context.Background(), "nope")
	if !errors.Is(err, ErrStoryNotFound) {
		t.Errorf("expected ErrStoryNotFound, got %v", err)
	}
}

func TestRootStoryID_PropagatesScanError(t *testing.T) {
	wantErr := errors.New("dynamo exploded")
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return nil, wantErr
	}

	_, err := mockDao.RootStoryID(context.Background(), "any")
	if !errors.Is(err, wantErr) {
		t.Errorf("expected scan error to propagate, got %v", err)
	}
}

// -----------------------------------------------------------------------
// CreateStoryDraft tests
// -----------------------------------------------------------------------

// draftTestFixture captures what the mock DynamoDB returned per call, and
// what writes it saw, so each test can assert on both.
type draftTestFixture struct {
	t                   *testing.T
	sourceStory         map[string]types.AttributeValue
	sourceChapterRows   []map[string]types.AttributeValue
	sourceBlockRows     []map[string]types.AttributeValue
	sourceOutlineRows   []map[string]types.AttributeValue
	userInfoRow         map[string]types.AttributeValue
	transactWriteCalls  []*dynamodb.TransactWriteItemsInput
	queryCalls          []*dynamodb.QueryInput
	txnWriteErr         error
	txnWriteErrAfterIdx int // return txnWriteErr starting at this call index
}

func newDraftFixture(t *testing.T) *draftTestFixture {
	return &draftTestFixture{t: t, txnWriteErrAfterIdx: -1}
}

func (f *draftTestFixture) wire(mockDao *MockDAO) {
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	mockClient.MockScan = func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		table := ""
		if input.TableName != nil {
			table = *input.TableName
		}
		switch {
		case strings.HasPrefix(table, "stories"):
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{f.sourceStory}}, nil
		case strings.HasPrefix(table, "chapters"):
			return &dynamodb.ScanOutput{Items: f.sourceChapterRows}, nil
		case strings.HasPrefix(table, "users"):
			if f.userInfoRow != nil {
				return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{f.userInfoRow}}, nil
			}
			// Minimal non-admin user row so GetUserDetails succeeds.
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{{
				"email":      &types.AttributeValueMemberS{Value: "user@example.com"},
				"admin":      &types.AttributeValueMemberBOOL{Value: false},
				"subscriber": &types.AttributeValueMemberBOOL{Value: true},
			}}}, nil
		default:
			return &dynamodb.ScanOutput{Items: nil}, nil
		}
	}

	mockClient.MockQuery = func(_ context.Context, input *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		f.queryCalls = append(f.queryCalls, input)
		table := ""
		if input.TableName != nil {
			table = *input.TableName
		}
		switch {
		case strings.HasPrefix(table, "outlines"):
			return &dynamodb.QueryOutput{Items: f.sourceOutlineRows}, nil
		case strings.HasPrefix(table, StoryBlocksTableName):
			return &dynamodb.QueryOutput{Items: f.sourceBlockRows}, nil
		default:
			return &dynamodb.QueryOutput{Items: nil}, nil
		}
	}

	mockClient.MockTransactWriteItems = func(_ context.Context, input *dynamodb.TransactWriteItemsInput, _ ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
		f.transactWriteCalls = append(f.transactWriteCalls, input)
		if f.txnWriteErr != nil && len(f.transactWriteCalls) > f.txnWriteErrAfterIdx {
			return nil, f.txnWriteErr
		}
		return &dynamodb.TransactWriteItemsOutput{}, nil
	}
}

func storyRow(id, author, title string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: id},
		"author":      &types.AttributeValueMemberS{Value: author},
		"title":       &types.AttributeValueMemberS{Value: title},
		"description": &types.AttributeValueMemberS{Value: "a desc"},
		"image_url":   &types.AttributeValueMemberS{Value: "img.png"},
	}
}

func chapterRow(storyID, chapterID, title string, place int) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: storyID},
		"chapter_id":  &types.AttributeValueMemberS{Value: chapterID},
		"chapter_num": &types.AttributeValueMemberN{Value: strconv.Itoa(place)},
		"title":       &types.AttributeValueMemberS{Value: title},
	}
}

func TestCreateStoryDraft_HappyPath(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	f.sourceStory = storyRow("source-1", "user@example.com", "Original Title")
	f.sourceChapterRows = []map[string]types.AttributeValue{
		chapterRow("source-1", "ch-1", "Chapter 1", 1),
		chapterRow("source-1", "ch-2", "Chapter 2", 2),
	}
	// no blocks, no outline for the simple happy-path case
	f.wire(mockDao)

	got, err := mockDao.CreateStoryDraft(context.Background(), "user@example.com", "source-1", "Alternate")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatal("expected non-nil story")
	}
	if got.ID == "source-1" {
		t.Errorf("new story should have a fresh id, got %q (same as source)", got.ID)
	}
	if got.OriginalStoryID != "source-1" {
		t.Errorf("OriginalStoryID should point at the source root, got %q want source-1", got.OriginalStoryID)
	}
	if got.DraftName != "Alternate" {
		t.Errorf("DraftName mismatch: got %q want Alternate", got.DraftName)
	}
	if got.IsCurrentDraft {
		t.Errorf("new draft should default to IsCurrentDraft=false")
	}
	if got.Title != "Original Title" {
		t.Errorf("title should be copied from source, got %q", got.Title)
	}
	if len(got.Chapters) != 2 {
		t.Fatalf("expected 2 cloned chapters, got %d", len(got.Chapters))
	}
	for i, ch := range got.Chapters {
		if ch.ID == f.sourceChapterRows[i]["chapter_id"].(*types.AttributeValueMemberS).Value {
			t.Errorf("chapter %d should have a fresh id; got %q matching source", i, ch.ID)
		}
		if ch.StoryID != got.ID {
			t.Errorf("chapter %d story_id should be the new story id", i)
		}
	}
	// First TransactWrite must contain the story put + 2 chapter puts (3 items).
	if len(f.transactWriteCalls) < 1 {
		t.Fatalf("expected at least 1 TransactWriteItems call, got %d", len(f.transactWriteCalls))
	}
	if n := len(f.transactWriteCalls[0].TransactItems); n != 3 {
		t.Errorf("first transaction should carry story+2 chapters (3 items), got %d", n)
	}
}

func TestCreateStoryDraft_ChildResolvesToExistingRoot(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	// Source is itself a draft, pointing at root-A.
	f.sourceStory = storyRow("draft-B", "user@example.com", "Draft B")
	f.sourceStory["original_story_id"] = &types.AttributeValueMemberS{Value: "root-A"}
	f.sourceChapterRows = []map[string]types.AttributeValue{
		chapterRow("draft-B", "ch-x", "A", 1),
	}
	f.wire(mockDao)

	got, err := mockDao.CreateStoryDraft(context.Background(), "user@example.com", "draft-B", "Draft C")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.OriginalStoryID != "root-A" {
		t.Errorf("drafts-of-drafts should still root at root-A, got %q", got.OriginalStoryID)
	}
}

func TestCreateStoryDraft_SeriesIDInherited(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	f.sourceStory = storyRow("source-1", "user@example.com", "T")
	f.sourceStory["series_id"] = &types.AttributeValueMemberS{Value: "series-99"}
	f.sourceStory["place"] = &types.AttributeValueMemberN{Value: "3"}
	f.sourceChapterRows = []map[string]types.AttributeValue{
		chapterRow("source-1", "ch-1", "A", 1),
	}
	f.wire(mockDao)

	_, err := mockDao.CreateStoryDraft(context.Background(), "user@example.com", "source-1", "D")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// First transaction must have series_id and place on the new story row.
	if len(f.transactWriteCalls) == 0 {
		t.Fatal("expected a transaction write call")
	}
	put := f.transactWriteCalls[0].TransactItems[0].Put
	if put == nil {
		t.Fatal("first transaction item should be a Put for the new story")
	}
	if v, ok := put.Item["series_id"].(*types.AttributeValueMemberS); !ok || v.Value != "series-99" {
		t.Errorf("series_id should be inherited from source, got %+v", put.Item["series_id"])
	}
	if v, ok := put.Item["place"].(*types.AttributeValueMemberN); !ok || v.Value != "3" {
		t.Errorf("place should be inherited from source, got %+v", put.Item["place"])
	}
}

// -----------------------------------------------------------------------
// CurrentDraftID tests
// -----------------------------------------------------------------------

func TestCurrentDraftID_ResolvesToFlaggedSibling(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	callCount := 0
	mockClient.MockScan = func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		callCount++
		// First scan is the root resolution for storyID; return root.
		if callCount == 1 {
			return scanOutputForStory("root-abc", ""), nil
		}
		// Second scan looks up the current draft.
		item := map[string]types.AttributeValue{
			"story_id":          &types.AttributeValueMemberS{Value: "draft-current"},
			"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
			"is_current_draft":  &types.AttributeValueMemberBOOL{Value: true},
		}
		return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{item}}, nil
	}

	got, err := mockDao.DAO.CurrentDraftID(context.Background(), "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "draft-current" {
		t.Errorf("got %q want draft-current", got)
	}
}

func TestCurrentDraftID_FallsBackToRootWhenNoneFlagged(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	callCount := 0
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		callCount++
		if callCount == 1 {
			return scanOutputForStory("root-abc", ""), nil
		}
		return &dynamodb.ScanOutput{Items: nil}, nil
	}

	got, err := mockDao.DAO.CurrentDraftID(context.Background(), "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("fallback should be root id, got %q", got)
	}
}

// -----------------------------------------------------------------------
// StoryOrSeriesID tests
// -----------------------------------------------------------------------

func TestStoryOrSeriesID_RootNoSeriesReturnsRoot(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("root-abc", ""), nil
	}
	// Explicitly make IsStoryInASeries return no series.
	mockDao.MockIsStoryInASeries = func(_, _ string) (string, error) { return "", nil }

	got, err := mockDao.StoryOrSeriesID(context.Background(), "user@example.com", "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("got %q want root-abc", got)
	}
}

// scanRouter is a mock-Scan handler that dispatches by table-name prefix
// and (optionally) by the :s expression attribute value. Returns an empty
// scan for anything it doesn't recognize so IsStoryInASeries's chained
// user/stories lookups don't error out.
func scanRouter(byTableAndStoryVal map[string]map[string][]map[string]types.AttributeValue, usersRow map[string]types.AttributeValue) func(context.Context, *dynamodb.ScanInput, ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	return func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		table := ""
		if input.TableName != nil {
			table = *input.TableName
		}
		if strings.HasPrefix(table, "users") && usersRow != nil {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{usersRow}}, nil
		}
		for prefix, byVal := range byTableAndStoryVal {
			if strings.HasPrefix(table, prefix) {
				if v, ok := input.ExpressionAttributeValues[":s"].(*types.AttributeValueMemberS); ok {
					if rows, ok := byVal[v.Value]; ok {
						return &dynamodb.ScanOutput{Items: rows}, nil
					}
				}
			}
		}
		return &dynamodb.ScanOutput{Items: nil}, nil
	}
}

func defaultUsersRow() map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"email":      &types.AttributeValueMemberS{Value: "user@example.com"},
		"admin":      &types.AttributeValueMemberBOOL{Value: false},
		"subscriber": &types.AttributeValueMemberBOOL{Value: true},
	}
}

func TestStoryOrSeriesID_DraftInSeriesReturnsSeries(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	rootRowWithSeries := storyRow("root-abc", "user@example.com", "T")
	rootRowWithSeries["series_id"] = &types.AttributeValueMemberS{Value: "series-999"}

	mockClient.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {
			"draft-xyz": {func() map[string]types.AttributeValue {
				row := storyRow("draft-xyz", "user@example.com", "T")
				row["original_story_id"] = &types.AttributeValueMemberS{Value: "root-abc"}
				return row
			}()},
			"root-abc": {rootRowWithSeries},
		},
	}, defaultUsersRow())

	got, err := mockDao.DAO.StoryOrSeriesID(context.Background(), "user@example.com", "draft-xyz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "series-999" {
		t.Errorf("got %q want series-999", got)
	}
}

func TestStoryOrSeriesID_DraftNoSeriesReturnsRoot(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	mockClient.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {
			"draft-xyz": {func() map[string]types.AttributeValue {
				row := storyRow("draft-xyz", "user@example.com", "T")
				row["original_story_id"] = &types.AttributeValueMemberS{Value: "root-abc"}
				return row
			}()},
			"root-abc": {storyRow("root-abc", "user@example.com", "T")},
		},
	}, defaultUsersRow())

	got, err := mockDao.DAO.StoryOrSeriesID(context.Background(), "user@example.com", "draft-xyz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("draft without series must scope to root, got %q want root-abc", got)
	}
}

// -----------------------------------------------------------------------
// ListDrafts / RenameDraft smoke tests
// -----------------------------------------------------------------------

func TestListDrafts_ReturnsRootFirst(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	callCount := 0
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		callCount++
		if callCount == 1 {
			// Root resolution for the input story.
			return scanOutputForStory("root-abc", ""), nil
		}
		// Ancestry query: root + 2 drafts, intentionally returned in a
		// non-root-first order to exercise the reorder.
		return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
			{
				"story_id":          &types.AttributeValueMemberS{Value: "draft-2"},
				"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
				"created_at":        &types.AttributeValueMemberN{Value: "2000"},
			},
			{
				"story_id":          &types.AttributeValueMemberS{Value: "draft-1"},
				"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
				"created_at":        &types.AttributeValueMemberN{Value: "1000"},
			},
			{
				"story_id":   &types.AttributeValueMemberS{Value: "root-abc"},
				"created_at": &types.AttributeValueMemberN{Value: "500"},
			},
		}}, nil
	}

	got, err := mockDao.DAO.ListDrafts(context.Background(), "user@example.com", "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(got))
	}
	if got[0].ID != "root-abc" {
		t.Errorf("root should sort first, got %q", got[0].ID)
	}
	if got[1].ID != "draft-1" || got[2].ID != "draft-2" {
		t.Errorf("drafts should be oldest-first after the root, got [%s %s]", got[1].ID, got[2].ID)
	}
}

func TestRenameDraft_IssuesUpdate(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	var captured *dynamodb.UpdateItemInput
	mockClient.MockUpdateItem = func(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
		captured = input
		return &dynamodb.UpdateItemOutput{}, nil
	}

	err := mockDao.DAO.RenameDraft(context.Background(), "user@example.com", "story-1", "Alternate Ending")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if captured == nil {
		t.Fatal("expected UpdateItem to be called")
	}
	if v, ok := captured.ExpressionAttributeValues[":n"].(*types.AttributeValueMemberS); !ok || v.Value != "Alternate Ending" {
		t.Errorf("new name not plumbed through: %+v", captured.ExpressionAttributeValues[":n"])
	}
}

func TestCreateStoryDraft_RollsBackOnBlockCopyFailure(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	f.sourceStory = storyRow("source-1", "user@example.com", "T")
	f.sourceChapterRows = []map[string]types.AttributeValue{
		chapterRow("source-1", "ch-1", "A", 1),
	}
	// One block exists for the source chapter, so the block-copy path runs.
	f.sourceBlockRows = []map[string]types.AttributeValue{
		{
			"composite_key": &types.AttributeValueMemberS{Value: "source-1#ch-1"},
			"place":         &types.AttributeValueMemberN{Value: "1"},
			"key_id":        &types.AttributeValueMemberS{Value: "k-1"},
			"chunk":         &types.AttributeValueMemberS{Value: "hello"},
		},
	}
	// Make the SECOND TransactWriteItems call fail (first is story+chapter,
	// second is block copy).
	f.txnWriteErr = errors.New("simulated block copy failure")
	f.txnWriteErrAfterIdx = 1
	f.wire(mockDao)

	deleteItemCalls := 0
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockDeleteItem = func(_ context.Context, _ *dynamodb.DeleteItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
		deleteItemCalls++
		return &dynamodb.DeleteItemOutput{}, nil
	}

	_, err := mockDao.CreateStoryDraft(context.Background(), "user@example.com", "source-1", "D")
	if err == nil {
		t.Fatal("expected an error from the simulated failure")
	}
	// Rollback must at least attempt to delete the new chapter and the new story row.
	if deleteItemCalls < 2 {
		t.Errorf("rollback should delete the new chapter and the new story row (>=2 DeleteItem calls), got %d", deleteItemCalls)
	}
}
