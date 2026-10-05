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

// storyRow builds a stories-table row for test fixtures. All tests share
// the same test user, so `author` is hard-coded rather than parameterized.
func storyRow(id, title string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: id},
		"author":      &types.AttributeValueMemberS{Value: "user@example.com"},
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
	f.sourceStory = storyRow("source-1", "Original Title")
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
	if !got.IsCurrentDraft {
		t.Errorf("new draft should auto-promote to IsCurrentDraft=true")
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
	// Transaction must contain the story put + 2 chapter puts + 1 demote
	// update for the previous current (4 items total).
	if len(f.transactWriteCalls) < 1 {
		t.Fatalf("expected at least 1 TransactWriteItems call, got %d", len(f.transactWriteCalls))
	}
	if n := len(f.transactWriteCalls[0].TransactItems); n != 4 {
		t.Errorf("transaction should carry story+2 chapters+demote (4 items), got %d", n)
	}
	// The new draft row must set is_current_draft=true — auto-promotion
	// on create.
	put := f.transactWriteCalls[0].TransactItems[0].Put
	if put == nil {
		t.Fatal("first transaction item should be the new story Put")
	}
	v, ok := put.Item["is_current_draft"].(*types.AttributeValueMemberBOOL)
	if !ok {
		t.Fatalf("new draft must have is_current_draft set, got %+v", put.Item["is_current_draft"])
	}
	if !v.Value {
		t.Errorf("new draft must auto-promote (is_current_draft=true), got false")
	}
	if !got.IsCurrentDraft {
		t.Errorf("returned story should reflect is_current_draft=true")
	}
	// The last transaction item should be the demote update targeting
	// the previous current (the source story, since nothing else exists
	// in the ancestry at creation time).
	last := f.transactWriteCalls[0].TransactItems[3].Update
	if last == nil {
		t.Fatal("last transaction item should be an Update (demote)")
	}
	key, ok := last.Key[attrStoryID].(*types.AttributeValueMemberS)
	if !ok || key.Value != "source-1" {
		t.Errorf("demote update should target source-1, got %+v", last.Key)
	}
}

func TestCreateStoryDraft_ChildResolvesToExistingRoot(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	// Source is itself a draft, pointing at root-A.
	f.sourceStory = storyRow("draft-B", "Draft B")
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

func TestCreateStoryDraft_SeriesIDTransfersToNewCurrent(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	f.sourceStory = storyRow("source-1", "T")
	f.sourceStory["series_id"] = &types.AttributeValueMemberS{Value: "series-99"}
	f.sourceStory["place"] = &types.AttributeValueMemberN{Value: "3"}
	f.sourceStory["is_current_draft"] = &types.AttributeValueMemberBOOL{Value: true}
	f.sourceChapterRows = []map[string]types.AttributeValue{
		chapterRow("source-1", "ch-1", "A", 1),
	}
	f.wire(mockDao)

	_, err := mockDao.CreateStoryDraft(context.Background(), "user@example.com", "source-1", "D")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Auto-promotion: the new draft takes over as the ancestry's
	// current, so series_id/place transfers from the previous current
	// (source-1, which was in series-99 at place 3). The previous
	// current's demote update should REMOVE them in the same
	// transaction, keeping the series listing to one row per ancestry.
	if len(f.transactWriteCalls) == 0 {
		t.Fatal("expected a transaction write call")
	}
	put := f.transactWriteCalls[0].TransactItems[0].Put
	if put == nil {
		t.Fatal("first transaction item should be a Put for the new story")
	}
	v, ok := put.Item["series_id"].(*types.AttributeValueMemberS)
	if !ok || v.Value != "series-99" {
		t.Errorf("series_id should transfer to new draft, got %+v", put.Item["series_id"])
	}
	p, ok := put.Item["place"].(*types.AttributeValueMemberN)
	if !ok || p.Value != "3" {
		t.Errorf("place should transfer to new draft, got %+v", put.Item["place"])
	}
}

// -----------------------------------------------------------------------
// CurrentDraftID tests
// -----------------------------------------------------------------------

func TestCurrentDraftID_ResolvesToFlaggedSibling(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	// RootStoryID (via getStoryByIDUnscoped) still issues a Scan.
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("root-abc", ""), nil
	}
	// The current-draft lookup now uses a Query against the GSI.
	queryCount := 0
	mockClient.MockQuery = func(_ context.Context, input *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		queryCount++
		if input.IndexName == nil || *input.IndexName != "original_story_id_index" {
			t.Errorf("expected Query against original_story_id_index, got IndexName=%v", input.IndexName)
		}
		item := map[string]types.AttributeValue{
			"story_id":          &types.AttributeValueMemberS{Value: "draft-current"},
			"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
			"is_current_draft":  &types.AttributeValueMemberBOOL{Value: true},
		}
		return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{item}}, nil
	}

	got, err := mockDao.DAO.CurrentDraftID(context.Background(), "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "draft-current" {
		t.Errorf("got %q want draft-current", got)
	}
	if queryCount != 1 {
		t.Errorf("expected one GSI Query, got %d", queryCount)
	}
}

func TestCurrentDraftID_FallsBackToRootWhenNoneFlagged(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)

	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("root-abc", ""), nil
	}
	mockClient.MockQuery = func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		return &dynamodb.QueryOutput{Items: nil}, nil
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
func scanRouter(
	byTableAndStoryVal map[string]map[string][]map[string]types.AttributeValue,
	usersRow map[string]types.AttributeValue,
) func(context.Context, *dynamodb.ScanInput, ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
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
				if v, vOK := input.ExpressionAttributeValues[":s"].(*types.AttributeValueMemberS); vOK {
					if rows, rowsOK := byVal[v.Value]; rowsOK {
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

	rootRowWithSeries := storyRow("root-abc", "T")
	rootRowWithSeries["series_id"] = &types.AttributeValueMemberS{Value: "series-999"}

	mockClient.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {
			"draft-xyz": {func() map[string]types.AttributeValue {
				row := storyRow("draft-xyz", "T")
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
				row := storyRow("draft-xyz", "T")
				row["original_story_id"] = &types.AttributeValueMemberS{Value: "root-abc"}
				return row
			}()},
			"root-abc": {storyRow("root-abc", "T")},
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

	// RootStoryID: lookup via Scan (first call), then GetStoryByID
	// re-reads the root (second call) + GetUserDetails + chapters.
	// scanRouter dispatches by table name so each read lands in the
	// right branch.
	mockClient.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {
			"root-abc": {{
				"story_id":   &types.AttributeValueMemberS{Value: "root-abc"},
				"author":     &types.AttributeValueMemberS{Value: "user@example.com"},
				"title":      &types.AttributeValueMemberS{Value: "Original"},
				"created_at": &types.AttributeValueMemberN{Value: "500"},
			}},
		},
		"chapters": {},
	}, defaultUsersRow())

	// ListDrafts' main query hits the GSI; return drafts oldest-first
	// (GSI SK=created_at ascending, so this mirrors real behavior).
	gsiHit := false
	mockClient.MockQuery = func(_ context.Context, input *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		if input.IndexName != nil && *input.IndexName == "original_story_id_index" {
			gsiHit = true
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{
				{
					"story_id":          &types.AttributeValueMemberS{Value: "draft-1"},
					"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
					"author":            &types.AttributeValueMemberS{Value: "user@example.com"},
					"created_at":        &types.AttributeValueMemberN{Value: "1000"},
				},
				{
					"story_id":          &types.AttributeValueMemberS{Value: "draft-2"},
					"original_story_id": &types.AttributeValueMemberS{Value: "root-abc"},
					"author":            &types.AttributeValueMemberS{Value: "user@example.com"},
					"created_at":        &types.AttributeValueMemberN{Value: "2000"},
				},
			}}, nil
		}
		// Non-GSI query (e.g. a block-paragraphs query triggered by
		// GetStoryByID's lazy first-chapter creation path): return empty.
		return &dynamodb.QueryOutput{Items: nil}, nil
	}

	got, err := mockDao.DAO.ListDrafts(context.Background(), "user@example.com", "root-abc")
	if !gsiHit {
		t.Errorf("expected the GSI to be queried, but no Query hit original_story_id_index")
	}
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 rows (root + 2 drafts), got %d", len(got))
	}
	if got[0].ID != "root-abc" {
		t.Errorf("root should come first, got %q", got[0].ID)
	}
	if got[1].ID != "draft-1" || got[2].ID != "draft-2" {
		t.Errorf("drafts should be oldest-first after the root, got [%s %s]", got[1].ID, got[2].ID)
	}
}

// -----------------------------------------------------------------------
// PromoteNewRoot tests
// -----------------------------------------------------------------------

// promoteFixture seeds the mock responses needed by PromoteNewRoot.
// `scenario` tweaks what IsStoryInASeries returns and whether there's a
// current draft among the siblings; the fixture provides a working
// ancestry of a root plus two drafts (drafts[0]=current, drafts[1]=older
// non-current) and no associations/share-links by default.
type promoteFixture struct {
	oldRootID        string
	seriesID         string // "" means not in a series
	currentDraftID   string // "" means neither draft is current
	draftsOldestID   string
	draftsNewestID   string
	transactWrites   []*dynamodb.TransactWriteItemsInput
	associationQuery bool
	shareLinkQuery   bool
}

func (f *promoteFixture) wire(m *MockDAO) {
	mc := m.DynamoClient.(*MockDynamoClient)

	// Build the ancestry: root + two drafts. ListDrafts calls GetStoryByID
	// for the root and Queries the GSI for drafts; the root-resolution
	// path (RootStoryID -> getStoryByIDUnscoped) also lands on the
	// stories Scan path.
	rootRow := storyRow(f.oldRootID, "Original")
	rootRow["created_at"] = &types.AttributeValueMemberN{Value: "100"}
	if f.seriesID != "" {
		rootRow["series_id"] = &types.AttributeValueMemberS{Value: f.seriesID}
	}

	oldestDraftRow := storyRow(f.draftsOldestID, "Draft old")
	oldestDraftRow["original_story_id"] = &types.AttributeValueMemberS{Value: f.oldRootID}
	oldestDraftRow["created_at"] = &types.AttributeValueMemberN{Value: "200"}
	if f.currentDraftID == f.draftsOldestID {
		oldestDraftRow["is_current_draft"] = &types.AttributeValueMemberBOOL{Value: true}
	}

	newestDraftRow := storyRow(f.draftsNewestID, "Draft new")
	newestDraftRow["original_story_id"] = &types.AttributeValueMemberS{Value: f.oldRootID}
	newestDraftRow["created_at"] = &types.AttributeValueMemberN{Value: "300"}
	if f.currentDraftID == f.draftsNewestID {
		newestDraftRow["is_current_draft"] = &types.AttributeValueMemberBOOL{Value: true}
	}

	mc.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {
			f.oldRootID: {rootRow},
		},
	}, defaultUsersRow())

	mc.MockQuery = func(_ context.Context, input *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		if input.TableName == nil {
			return &dynamodb.QueryOutput{}, nil
		}
		tbl := *input.TableName
		switch {
		case strings.HasPrefix(tbl, "stories") && input.IndexName != nil && *input.IndexName == "original_story_id_index":
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{oldestDraftRow, newestDraftRow}}, nil
		case strings.HasPrefix(tbl, "associations"):
			f.associationQuery = true
			return &dynamodb.QueryOutput{Items: nil}, nil
		case strings.HasPrefix(tbl, "share_links"):
			f.shareLinkQuery = true
			return &dynamodb.QueryOutput{Items: nil}, nil
		case strings.HasPrefix(tbl, "outlines"):
			return &dynamodb.QueryOutput{Items: nil}, nil
		default:
			return &dynamodb.QueryOutput{}, nil
		}
	}

	mc.MockTransactWriteItems = func(_ context.Context, input *dynamodb.TransactWriteItemsInput, _ ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
		f.transactWrites = append(f.transactWrites, input)
		return &dynamodb.TransactWriteItemsOutput{}, nil
	}
}

func TestPromoteNewRoot_PrefersCurrentDraft(t *testing.T) {
	m := NewMockDAO()
	// Make IsStoryInASeries return "" so the association path runs.
	m.MockIsStoryInASeries = func(_, _ string) (string, error) { return "", nil }

	f := &promoteFixture{
		oldRootID:      "root-1",
		draftsOldestID: "draft-older",
		draftsNewestID: "draft-newer",
		currentDraftID: "draft-newer", // explicit current should win
	}
	f.wire(m)

	newRootID, err := m.PromoteNewRoot(context.Background(), "user@example.com", "root-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if newRootID != "draft-newer" {
		t.Errorf("expected the current draft to be promoted, got %q want draft-newer", newRootID)
	}
	if len(f.transactWrites) == 0 {
		t.Fatal("expected a promotion transaction")
	}
	if !f.associationQuery {
		t.Errorf("expected associations rekey path to run when not in a series")
	}
	if !f.shareLinkQuery {
		t.Errorf("expected share-link rekey path to run")
	}
}

func TestPromoteNewRoot_FallsBackToOldestDraft(t *testing.T) {
	m := NewMockDAO()
	m.MockIsStoryInASeries = func(_, _ string) (string, error) { return "", nil }

	f := &promoteFixture{
		oldRootID:      "root-1",
		draftsOldestID: "draft-older",
		draftsNewestID: "draft-newer",
		// no currentDraftID → should fall back to oldest.
	}
	f.wire(m)

	newRootID, err := m.PromoteNewRoot(context.Background(), "user@example.com", "root-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if newRootID != "draft-older" {
		t.Errorf("fallback should pick oldest draft, got %q want draft-older", newRootID)
	}
}

func TestPromoteNewRoot_SkipsAssociationRekeyWhenInSeries(t *testing.T) {
	m := NewMockDAO()
	// Series-scoped: associations keyed on series_id, which doesn't change.
	m.MockIsStoryInASeries = func(_, _ string) (string, error) { return "series-99", nil }

	f := &promoteFixture{
		oldRootID:      "root-1",
		seriesID:       "series-99",
		draftsOldestID: "draft-older",
		draftsNewestID: "draft-newer",
	}
	f.wire(m)

	if _, err := m.PromoteNewRoot(context.Background(), "user@example.com", "root-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if f.associationQuery {
		t.Errorf("expected association rekey to be skipped when the ancestry is in a series")
	}
	// Share-link rekey still runs regardless of series membership.
	if !f.shareLinkQuery {
		t.Errorf("expected share-link rekey to run")
	}
}

func TestPromoteNewRoot_RefusesNonRoot(t *testing.T) {
	m := NewMockDAO()
	mc := m.DynamoClient.(*MockDynamoClient)
	// getStoryByIDUnscoped returns a row that already has
	// original_story_id, meaning the caller passed a draft, not a root.
	mc.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("draft-xyz", "root-abc"), nil
	}

	_, err := m.PromoteNewRoot(context.Background(), "user@example.com", "draft-xyz")
	if err == nil || !strings.Contains(err.Error(), "not a root") {
		t.Errorf("expected 'not a root' error, got %v", err)
	}
}

func TestPromoteNewRoot_RefusesWhenNoDrafts(t *testing.T) {
	m := NewMockDAO()
	mc := m.DynamoClient.(*MockDynamoClient)
	// Root exists, but ListDrafts returns no drafts.
	rootRow := storyRow("root-1", "Original")
	rootRow["created_at"] = &types.AttributeValueMemberN{Value: "100"}
	mc.MockScan = scanRouter(map[string]map[string][]map[string]types.AttributeValue{
		"stories": {"root-1": {rootRow}},
	}, defaultUsersRow())
	mc.MockQuery = func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
		return &dynamodb.QueryOutput{Items: nil}, nil
	}

	_, err := m.PromoteNewRoot(context.Background(), "user@example.com", "root-1")
	if err == nil || !strings.Contains(err.Error(), "no drafts to promote") {
		t.Errorf("expected 'no drafts to promote' error, got %v", err)
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
	if v, ok := captured.ExpressionAttributeValues[":n"].(*types.AttributeValueMemberS); !ok ||
		v.Value != "Alternate Ending" {
		t.Errorf("new name not plumbed through: %+v", captured.ExpressionAttributeValues[":n"])
	}
}

func TestCreateStoryDraft_RollsBackOnBlockCopyFailure(t *testing.T) {
	mockDao := NewMockDAO()
	f := newDraftFixture(t)
	f.sourceStory = storyRow("source-1", "T")
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
		t.Errorf(
			"rollback should delete the new chapter and the new story row (>=2 DeleteItem calls), got %d",
			deleteItemCalls,
		)
	}
}
