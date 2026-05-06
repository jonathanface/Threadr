package daos

import (
	"context"
	"errors"
	"testing"

	"Threadr/models"
)

// Tests for GetOutlineByStoryID.
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
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			outline, err := mockDao.GetOutlineByStoryID(context.Background(), tc.storyID, tc.chapters)

			t.Logf("GetOutlineByStoryID(%q) returned outline=%v, err=%v", tc.storyID, outline != nil, err)
		})
	}
}

// Tests for CreateOutline.
func TestCreateOutline(t *testing.T) {
	testCases := []struct {
		name        string
		outline     models.OutlineRequest
		mockOutline *models.OutlineRequest
		mockErr     error
		wantErr     bool
	}{
		{
			name: "SuccessfulCreate_ThreeActTemplate",
			outline: models.OutlineRequest{
				StoryID:   "story123",
				Template:  models.ThreeAct,
				Backstory: "A hero's journey begins",
			},
			mockOutline: &models.OutlineRequest{
				StoryID:   "story123",
				Template:  models.ThreeAct,
				Backstory: "A hero's journey begins",
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "SuccessfulCreate_HeroJourneyTemplate",
			outline: models.OutlineRequest{
				StoryID:   "story456",
				Template:  models.HeroJourney,
				Backstory: "An epic adventure",
			},
			mockOutline: &models.OutlineRequest{
				StoryID:   "story456",
				Template:  models.HeroJourney,
				Backstory: "An epic adventure",
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "DatabaseError",
			outline: models.OutlineRequest{
				StoryID:  "story789",
				Template: models.ThreeAct,
			},
			mockOutline: nil,
			mockErr:     errors.New("database write error"),
			wantErr:     true,
		},
		{
			name: "EmptyStoryID",
			outline: models.OutlineRequest{
				StoryID:  "",
				Template: models.ThreeAct,
			},
			mockOutline: nil,
			mockErr:     errors.New("invalid story ID"),
			wantErr:     true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockDao.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
				if outline.StoryID != tc.outline.StoryID {
					t.Errorf("expected storyID %s, got %s", tc.outline.StoryID, outline.StoryID)
				}
				if outline.Template != tc.outline.Template {
					t.Errorf("expected template %s, got %s", tc.outline.Template, outline.Template)
				}
				return tc.mockOutline, tc.mockErr
			}

			result, err := mockDao.CreateOutline(context.Background(), tc.outline)

			if tc.wantErr {
				assertExpectedErr(t, err, "")
				if result != nil {
					t.Errorf("expected nil result on error, got %v", result)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			if result == nil {
				t.Fatal("expected non-nil result, got nil")
			}
			if result.StoryID != tc.outline.StoryID {
				t.Errorf("expected storyID %s, got %s", tc.outline.StoryID, result.StoryID)
			}
			if result.Template != tc.outline.Template {
				t.Errorf("expected template %s, got %s", tc.outline.Template, result.Template)
			}
		})
	}
}

// Tests for UpdateOutline.
func TestUpdateOutline(t *testing.T) {
	testCases := []struct {
		name         string
		outline      models.OutlineRequest
		mockResponse *models.OutlineResponse
		mockErr      error
		wantErr      bool
	}{
		{
			name: "SuccessfulUpdate_BasicSections",
			outline: models.OutlineRequest{
				StoryID:   "story123",
				Backstory: "Updated backstory",
				Sections: []models.OutlineSection{
					{
						Place:       1,
						Header:      "Act 1",
						Text:        "Setup content",
						Status:      models.Draft,
						Description: "First act",
					},
				},
			},
			mockResponse: &models.OutlineResponse{
				StoryID:   "story123",
				Backstory: "Updated backstory",
				Sections: []models.OutlineSection{
					{
						Place:  1,
						Header: "Act 1",
						Text:   "Setup content",
						Status: models.Draft,
					},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "SuccessfulUpdate_WithChapters",
			outline: models.OutlineRequest{
				StoryID: "story456",
				Sections: []models.OutlineSection{
					{
						Place:    1,
						Header:   "Act 1",
						Text:     "Content",
						Status:   models.Revising,
						Chapters: []string{"chapter1", "chapter2"},
					},
				},
			},
			mockResponse: &models.OutlineResponse{
				StoryID: "story456",
				Sections: []models.OutlineSection{
					{
						Place:    1,
						Header:   "Act 1",
						Text:     "Content",
						Status:   models.Revising,
						Chapters: []string{"chapter1", "chapter2"},
					},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "SuccessfulUpdate_RemoveChapters",
			outline: models.OutlineRequest{
				StoryID: "story789",
				Sections: []models.OutlineSection{
					{
						Place:    1,
						Header:   "Act 1",
						Text:     "Content",
						Status:   models.Draft,
						Chapters: []string{}, // Empty chapters array
					},
				},
			},
			mockResponse: &models.OutlineResponse{
				StoryID: "story789",
				Sections: []models.OutlineSection{
					{
						Place:    1,
						Header:   "Act 1",
						Text:     "Content",
						Status:   models.Draft,
						Chapters: []string{},
					},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "DatabaseError",
			outline: models.OutlineRequest{
				StoryID: "story999",
				Sections: []models.OutlineSection{
					{Place: 1, Header: "Test", Status: models.Draft},
				},
			},
			mockResponse: nil,
			mockErr:      errors.New("database update error"),
			wantErr:      true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockDao.MockUpdateOutline = func(outline models.OutlineRequest) (*models.OutlineResponse, error) {
				if outline.StoryID != tc.outline.StoryID {
					t.Errorf("expected storyID %s, got %s", tc.outline.StoryID, outline.StoryID)
				}
				if len(outline.Sections) != len(tc.outline.Sections) {
					t.Errorf("expected %d sections, got %d", len(tc.outline.Sections), len(outline.Sections))
				}
				return tc.mockResponse, tc.mockErr
			}

			result, err := mockDao.UpdateOutline(context.Background(), tc.outline)

			if tc.wantErr {
				assertExpectedErr(t, err, "")
				if result != nil {
					t.Errorf("expected nil result on error, got %v", result)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			if result == nil {
				t.Fatal("expected non-nil result, got nil")
			}
			if result.StoryID != tc.outline.StoryID {
				t.Errorf("expected storyID %s, got %s", tc.outline.StoryID, result.StoryID)
			}
			if len(result.Sections) != len(tc.mockResponse.Sections) {
				t.Errorf("expected %d sections, got %d", len(tc.mockResponse.Sections), len(result.Sections))
			}
		})
	}
}

func BenchmarkCreateOutline(b *testing.B) {
	mockDao := NewMockDAO()
	outline := models.OutlineRequest{
		StoryID: "story123",
	}

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.CreateOutline(context.Background(), outline)
	}
}

func BenchmarkGetOutlineByStoryID(b *testing.B) {
	mockDao := NewMockDAO()
	chapters := []models.Chapter{}

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.GetOutlineByStoryID(context.Background(), "story123", chapters)
	}
}
