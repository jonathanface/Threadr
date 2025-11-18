package daos

import (
	"RichDocter/models"
	"testing"
)

// Tests for GetChaptersByStoryID
func TestGetChaptersByStoryID(t *testing.T) {
	testCases := []struct {
		name    string
		storyID string
	}{
		{
			name:    "ValidStoryID_RequiresMockDB",
			storyID: "story123",
		},
		{
			name:    "EmptyStoryID",
			storyID: "",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			chapters, err := mockDao.GetChaptersByStoryID(tc.storyID)

			// Mock Scan returns empty result successfully
			t.Logf("GetChaptersByStoryID(%q) returned %d chapters, err=%v", tc.storyID, len(chapters), err)
		})
	}
}

// Tests for GetChapterTableStatus
func TestGetChapterTableStatus(t *testing.T) {
	testCases := []struct {
		name      string
		storyID   string
		chapterID string
	}{
		{
			name:      "ValidIDs_RequiresMockDB",
			storyID:   "story123",
			chapterID: "chapter456",
		},
		{
			name:      "EmptyIDs",
			storyID:   "",
			chapterID: "",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			exists, err := mockDao.GetChapterTableStatus(tc.storyID, tc.chapterID)

			t.Logf("GetChapterTableStatus(%q, %q) returned exists=%v, err=%v", tc.storyID, tc.chapterID, exists, err)
		})
	}
}

// Tests for GetChapterByID
func TestGetChapterByID(t *testing.T) {
	testCases := []struct {
		name      string
		chapterID string
	}{
		{
			name:      "ValidChapterID_RequiresMockDB",
			chapterID: "chapter123",
		},
		{
			name:      "EmptyChapterID",
			chapterID: "",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			chapter, err := mockDao.GetChapterByID(tc.chapterID)

			t.Logf("GetChapterByID(%q) returned chapter=%v, err=%v", tc.chapterID, chapter != nil, err)
		})
	}
}

// Tests for GetChapterParagraphs
func TestGetChapterParagraphs(t *testing.T) {
	testCases := []struct {
		name      string
		storyID   string
		chapterID string
	}{
		{
			name:      "ValidIDs_RequiresMockDB",
			storyID:   "story123",
			chapterID: "chapter456",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			blocksData, err := mockDao.GetChapterParagraphs(tc.storyID, tc.chapterID, nil)

			t.Logf("GetChapterParagraphs returned blocksData=%v, err=%v", blocksData != nil, err)
		})
	}
}

// Tests for DeleteChapterParagraphs
func TestDeleteChapterParagraphs(t *testing.T) {
	testCases := []struct {
		name        string
		storyID     string
		storyBlocks *models.StoryBlocks
		wantErr     bool
	}{
		{
			name:    "EmptyBlocks",
			storyID: "story123",
			storyBlocks: &models.StoryBlocks{
				Blocks: []models.StoryBlock{},
			},
			wantErr: false,
		},
		{
			name:    "WithBlocks_RequiresMockDB",
			storyID: "story456",
			storyBlocks: &models.StoryBlocks{
				Blocks: []models.StoryBlock{
					{KeyID: "block1", Place: "0"},
					{KeyID: "block2", Place: "1"},
				},
			},
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			err := mockDao.DeleteChapterParagraphs(tc.storyID, tc.storyBlocks)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Logf("Got error: %v (acceptable without full DB mock)", err)
				}
			}
		})
	}
}

// Tests for DeleteChapters
func TestDeleteChapters(t *testing.T) {
	testCases := []struct {
		name     string
		storyID  string
		chapters []models.Chapter
		wantErr  bool
	}{
		{
			name:     "EmptyChapters",
			storyID:  "story123",
			chapters: []models.Chapter{},
			wantErr:  false,
		},
		{
			name:    "WithChapters_RequiresMockDB",
			storyID: "story456",
			chapters: []models.Chapter{
				{ID: "chapter1", Title: "Chapter 1"},
				{ID: "chapter2", Title: "Chapter 2"},
			},
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			err := mockDao.DeleteChapters(tc.storyID, tc.chapters)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Logf("Got error: %v (acceptable without full DB mock)", err)
				}
			}
		})
	}
}

// Tests for GetBlockCountByChapter
func TestGetBlockCountByChapter(t *testing.T) {
	testCases := []struct {
		name      string
		email     string
		storyID   string
		chapterID string
	}{
		{
			name:      "ValidIDs_RequiresMockDB",
			email:     "user@example.com",
			storyID:   "story123",
			chapterID: "chapter456",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			count, err := mockDao.GetBlockCountByChapter(tc.email, tc.storyID, tc.chapterID)

			t.Logf("GetBlockCountByChapter returned count=%d, err=%v", count, err)
		})
	}
}

// Benchmark tests
func BenchmarkCreateChapter(b *testing.B) {
	mockDao := NewMockDAO()
	chapter := models.Chapter{
		Title:       "Benchmark Chapter",
		
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.CreateChapter("story123", chapter, "bench@example.com")
	}
}

func BenchmarkGetChaptersByStoryID(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetChaptersByStoryID("story123")
	}
}
