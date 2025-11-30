package daos

import (
	"RichDocter/models"
	"context"
	"testing"
)

// Tests for GetOutlineByStoryID
func TestGetOutlineByStoryID(t *testing.T) {
	testCases := []struct {
		name     string
		storyID  string
		chapters []models.Chapter
	}{
		{
			name:     "ValidStoryID_NoChapters",
			storyID:  "story123",
			chapters: []models.Chapter{},
		},
		{
			name:    "ValidStoryID_WithChapters",
			storyID: "story456",
			chapters: []models.Chapter{
				{ID: "chapter1", Title: "Chapter 1"},
				{ID: "chapter2", Title: "Chapter 2"},
			},
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			outline, err := mockDao.GetOutlineByStoryID(context.Background(), tc.storyID, tc.chapters)

			t.Logf("GetOutlineByStoryID(%q) returned outline=%v, err=%v", tc.storyID, outline != nil, err)
		})
	}
}

func BenchmarkCreateOutline(b *testing.B) {
	mockDao := NewMockDAO()
	outline := models.OutlineRequest{
		StoryID: "story123",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.CreateOutline(context.Background(), outline)
	}
}

func BenchmarkGetOutlineByStoryID(b *testing.B) {
	mockDao := NewMockDAO()
	chapters := []models.Chapter{}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetOutlineByStoryID(context.Background(), "story123", chapters)
	}
}
