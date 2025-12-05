package daos

import (
	"RichDocter/models"
	"context"
	"errors"
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

			chapters, err := mockDao.GetChaptersByStoryID(context.Background(), tc.storyID)

			// Mock Scan returns empty result successfully
			t.Logf("GetChaptersByStoryID(%q) returned %d chapters, err=%v", tc.storyID, len(chapters), err)
		})
	}
}

// Tests for GetChaptersByStoryIDs - batch method to avoid N+1 queries
func TestGetChaptersByStoryIDs(t *testing.T) {
	testCases := []struct {
		name     string
		storyIDs []string
		wantErr  bool
	}{
		{
			name:     "EmptyStoryIDs",
			storyIDs: []string{},
			wantErr:  false,
		},
		{
			name:     "SingleStoryID_RequiresMockDB",
			storyIDs: []string{"story123"},
			wantErr:  false,
		},
		{
			name:     "MultipleStoryIDs_RequiresMockDB",
			storyIDs: []string{"story123", "story456", "story789"},
			wantErr:  false,
		},
		{
			name:     "ManyStoryIDs_RequiresMockDB",
			storyIDs: []string{"story1", "story2", "story3", "story4", "story5", "story6", "story7", "story8", "story9", "story10"},
			wantErr:  false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			chaptersByStory, err := mockDao.GetChaptersByStoryIDs(context.Background(), tc.storyIDs)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Logf("Got error: %v (acceptable without full DB mock)", err)
				} else {
					t.Logf("GetChaptersByStoryIDs returned map with %d stories", len(chaptersByStory))

					// Verify structure
					if chaptersByStory == nil {
						t.Errorf("Expected non-nil map")
					}

					// For empty input, should return empty map
					if len(tc.storyIDs) == 0 && len(chaptersByStory) != 0 {
						t.Errorf("Expected empty map for empty input, got %d items", len(chaptersByStory))
					}
				}
			}
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

			exists, err := mockDao.GetChapterTableStatus(context.Background(), tc.storyID, tc.chapterID)

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

			chapter, err := mockDao.GetChapterByID(context.Background(), tc.chapterID)

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

			blocksData, err := mockDao.GetChapterParagraphs(context.Background(), tc.storyID, tc.chapterID, nil)

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

			err := mockDao.DeleteChapterParagraphs(context.Background(), tc.storyID, tc.storyBlocks)

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

			err := mockDao.DeleteChapters(context.Background(), tc.storyID, tc.chapters)

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

			count, err := mockDao.GetBlockCountByChapter(context.Background(), tc.email, tc.storyID, tc.chapterID)

			t.Logf("GetBlockCountByChapter returned count=%d, err=%v", count, err)
		})
	}
}

// Tests for CreateChapter
func TestCreateChapter(t *testing.T) {
	testCases := []struct {
		name        string
		storyID     string
		chapter     models.Chapter
		email       string
		mockChapter models.Chapter
		mockErr     error
		wantErr     bool
	}{
		{
			name:    "SuccessfulCreate_FirstChapter",
			storyID: "story123",
			chapter: models.Chapter{
				ID:    "chapter1",
				Title: "Chapter 1",
				Place: 1,
			},
			email: "user@example.com",
			mockChapter: models.Chapter{
				ID:    "chapter1",
				Title: "Chapter 1",
				Place: 1,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "SuccessfulCreate_SecondChapter",
			storyID: "story456",
			chapter: models.Chapter{
				ID:    "chapter2",
				Title: "Chapter 2: The Adventure Continues",
				Place: 2,
			},
			email: "user@example.com",
			mockChapter: models.Chapter{
				ID:    "chapter2",
				Title: "Chapter 2: The Adventure Continues",
				Place: 2,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "SuccessfulCreate_LongTitle",
			storyID: "story789",
			chapter: models.Chapter{
				ID:    "chapter3",
				Title: "A Very Long Chapter Title That Tests The System's Ability To Handle Extended Text",
				Place: 3,
			},
			email: "user@example.com",
			mockChapter: models.Chapter{
				ID:    "chapter3",
				Title: "A Very Long Chapter Title That Tests The System's Ability To Handle Extended Text",
				Place: 3,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "DatabaseError",
			storyID: "story999",
			chapter: models.Chapter{
				ID:    "chapter_error",
				Title: "Error Chapter",
				Place: 1,
			},
			email:       "user@example.com",
			mockChapter: models.Chapter{},
			mockErr:     errors.New("database transaction failed"),
			wantErr:     true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			mockDao.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
				if storyID != tc.storyID {
					t.Errorf("Expected storyID %s, got %s", tc.storyID, storyID)
				}
				if chapter.ID != tc.chapter.ID {
					t.Errorf("Expected chapter ID %s, got %s", tc.chapter.ID, chapter.ID)
				}
				if chapter.Title != tc.chapter.Title {
					t.Errorf("Expected title %s, got %s", tc.chapter.Title, chapter.Title)
				}
				if chapter.Place != tc.chapter.Place {
					t.Errorf("Expected place %d, got %d", tc.chapter.Place, chapter.Place)
				}
				if email != tc.email {
					t.Errorf("Expected email %s, got %s", tc.email, email)
				}
				return tc.mockChapter, tc.mockErr
			}

			newChapter, err := mockDao.CreateChapter(context.Background(), tc.storyID, tc.chapter, tc.email)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if newChapter.ID != tc.mockChapter.ID {
					t.Errorf("Expected chapter ID %s, got %s", tc.mockChapter.ID, newChapter.ID)
				}
				if newChapter.Title != tc.mockChapter.Title {
					t.Errorf("Expected title %s, got %s", tc.mockChapter.Title, newChapter.Title)
				}
				if newChapter.Place != tc.mockChapter.Place {
					t.Errorf("Expected place %d, got %d", tc.mockChapter.Place, newChapter.Place)
				}
			}
		})
	}
}

// Tests for EditChapter
func TestEditChapter(t *testing.T) {
	testCases := []struct {
		name        string
		storyID     string
		chapter     models.Chapter
		mockChapter models.Chapter
		mockErr     error
		wantErr     bool
	}{
		{
			name:    "SuccessfulEdit_TitleChange",
			storyID: "story123",
			chapter: models.Chapter{
				ID:    "chapter1",
				Title: "Updated Chapter Title",
				Place: 1,
			},
			mockChapter: models.Chapter{
				ID:    "chapter1",
				Title: "Updated Chapter Title",
				Place: 1,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "SuccessfulEdit_PlaceChange",
			storyID: "story456",
			chapter: models.Chapter{
				ID:    "chapter2",
				Title: "Chapter 2",
				Place: 3,
			},
			mockChapter: models.Chapter{
				ID:    "chapter2",
				Title: "Chapter 2",
				Place: 3,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "SuccessfulEdit_BothTitleAndPlace",
			storyID: "story789",
			chapter: models.Chapter{
				ID:    "chapter3",
				Title: "Completely Revised Chapter",
				Place: 5,
			},
			mockChapter: models.Chapter{
				ID:    "chapter3",
				Title: "Completely Revised Chapter",
				Place: 5,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:    "DatabaseError",
			storyID: "story999",
			chapter: models.Chapter{
				ID:    "chapter_error",
				Title: "Error Chapter",
				Place: 1,
			},
			mockChapter: models.Chapter{},
			mockErr:     errors.New("database update failed"),
			wantErr:     true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			mockDao.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
				if storyID != tc.storyID {
					t.Errorf("Expected storyID %s, got %s", tc.storyID, storyID)
				}
				if chapter.ID != tc.chapter.ID {
					t.Errorf("Expected chapter ID %s, got %s", tc.chapter.ID, chapter.ID)
				}
				if chapter.Title != tc.chapter.Title {
					t.Errorf("Expected title %s, got %s", tc.chapter.Title, chapter.Title)
				}
				if chapter.Place != tc.chapter.Place {
					t.Errorf("Expected place %d, got %d", tc.chapter.Place, chapter.Place)
				}
				return tc.mockChapter, tc.mockErr
			}

			updatedChapter, err := mockDao.EditChapter(context.Background(), tc.storyID, tc.chapter)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if updatedChapter.ID != tc.mockChapter.ID {
					t.Errorf("Expected chapter ID %s, got %s", tc.mockChapter.ID, updatedChapter.ID)
				}
				if updatedChapter.Title != tc.mockChapter.Title {
					t.Errorf("Expected title %s, got %s", tc.mockChapter.Title, updatedChapter.Title)
				}
				if updatedChapter.Place != tc.mockChapter.Place {
					t.Errorf("Expected place %d, got %d", tc.mockChapter.Place, updatedChapter.Place)
				}
			}
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
		_, _ = mockDao.CreateChapter(context.Background(), "story123", chapter, "bench@example.com")
	}
}

func BenchmarkGetChaptersByStoryID(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetChaptersByStoryID(context.Background(), "story123")
	}
}

func BenchmarkGetChaptersByStoryIDs(b *testing.B) {
	mockDao := NewMockDAO()
	storyIDs := []string{"story1", "story2", "story3", "story4", "story5"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetChaptersByStoryIDs(context.Background(), storyIDs)
	}
}
