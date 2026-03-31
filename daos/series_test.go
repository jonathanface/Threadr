package daos

import (
	"Threadr/models"
	"context"
	"errors"
	"testing"
)

// Tests for GetSeriesByID
func TestGetSeriesByID(t *testing.T) {
	testCases := []struct {
		name     string
		email    string
		seriesID string
	}{
		{
			name:     "ValidSeriesID_RequiresMockDB",
			email:    "user@example.com",
			seriesID: "series123",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			series, err := mockDao.GetSeriesByID(context.Background(), tc.email, tc.seriesID)

			t.Logf("GetSeriesByID returned series=%v, err=%v", series != nil, err)
		})
	}
}

// Tests for GetAllSeriesWithStories
func TestGetAllSeriesWithStories(t *testing.T) {
	testCases := []struct {
		name         string
		email        string
		adminRequest bool
	}{
		{
			name:         "UserRequest",
			email:        "user@example.com",
			adminRequest: false,
		},
		{
			name:         "AdminRequest",
			email:        "admin@example.com",
			adminRequest: true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			series, err := mockDao.GetAllSeriesWithStories(context.Background(), tc.email, tc.adminRequest)

			t.Logf("GetAllSeriesWithStories returned %d series, err=%v", len(series), err)
		})
	}
}

// Tests for GetSeriesVolumes
func TestGetSeriesVolumes(t *testing.T) {
	testCases := []struct {
		name     string
		email    string
		seriesID string
	}{
		{
			name:     "ValidSeriesID",
			email:    "user@example.com",
			seriesID: "series123",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			volumes, err := mockDao.GetSeriesVolumes(context.Background(), tc.email, tc.seriesID)

			t.Logf("GetSeriesVolumes returned %d volumes, err=%v", len(volumes), err)
		})
	}
}

// Tests for RemoveStoryFromSeries
func TestRemoveStoryFromSeries(t *testing.T) {
	testCases := []struct {
		name    string
		email   string
		storyID string
		series  models.Series
	}{
		{
			name:    "ValidRemoval",
			email:   "user@example.com",
			storyID: "story123",
			series: models.Series{
				ID:    "series123",
				Title: "Test Series",
			},
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			updatedSeries, err := mockDao.RemoveStoryFromSeries(context.Background(), tc.email, tc.storyID, tc.series)

			t.Logf("RemoveStoryFromSeries returned series=%v, err=%v", updatedSeries.ID != "", err)
		})
	}
}

// Tests for EditSeries
func TestEditSeries(t *testing.T) {
	testCases := []struct {
		name          string
		email         string
		series        models.Series
		mockSeries    models.Series
		mockErr       error
		wantErr       bool
	}{
		{
			name:  "SuccessfulEdit_BasicFields",
			email: "user@example.com",
			series: models.Series{
				ID:          "series123",
				Title:       "Updated Series Title",
				Description: "Updated description",
				ImageURL:    "https://example.com/new-image.jpg",
			},
			mockSeries: models.Series{
				ID:          "series123",
				Title:       "Updated Series Title",
				Description: "Updated description",
				ImageURL:    "https://example.com/new-image.jpg",
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "SuccessfulEdit_WithStories",
			email: "user@example.com",
			series: models.Series{
				ID:    "series456",
				Title: "My Series",
				Stories: []*models.Story{
					{ID: "story1", Place: 1},
					{ID: "story2", Place: 2},
				},
			},
			mockSeries: models.Series{
				ID:    "series456",
				Title: "My Series",
				Stories: []*models.Story{
					{ID: "story1", Place: 1},
					{ID: "story2", Place: 2},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "SuccessfulEdit_ReorderStories",
			email: "user@example.com",
			series: models.Series{
				ID:    "series789",
				Title: "Reordered Series",
				Stories: []*models.Story{
					{ID: "story2", Place: 1},
					{ID: "story1", Place: 2},
				},
			},
			mockSeries: models.Series{
				ID:    "series789",
				Title: "Reordered Series",
				Stories: []*models.Story{
					{ID: "story2", Place: 1},
					{ID: "story1", Place: 2},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "DatabaseError",
			email: "user@example.com",
			series: models.Series{
				ID:    "series999",
				Title: "Test Series",
			},
			mockSeries: models.Series{},
			mockErr:    errors.New("database update error"),
			wantErr:    true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockDao.MockEditSeries = func(email string, series models.Series) (models.Series, error) {
				if email != tc.email {
					t.Errorf("expected email %s, got %s", tc.email, email)
				}
				if series.ID != tc.series.ID {
					t.Errorf("expected series ID %s, got %s", tc.series.ID, series.ID)
				}
				if series.Title != tc.series.Title {
					t.Errorf("expected title %s, got %s", tc.series.Title, series.Title)
				}
				return tc.mockSeries, tc.mockErr
			}

			result, err := mockDao.EditSeries(context.Background(), tc.email, tc.series)

			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if result.ID != tc.series.ID {
					t.Errorf("expected series ID %s, got %s", tc.series.ID, result.ID)
				}
				if result.Title != tc.series.Title {
					t.Errorf("expected title %s, got %s", tc.series.Title, result.Title)
				}
			}
		})
	}
}

// Tests for DeleteSeries
func TestDeleteSeries(t *testing.T) {
	testCases := []struct {
		name    string
		email   string
		series  models.Series
		mockErr error
		wantErr bool
	}{
		{
			name:  "SuccessfulDelete_NoStories",
			email: "user@example.com",
			series: models.Series{
				ID:      "series123",
				Title:   "Empty Series",
				Stories: []*models.Story{},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "SuccessfulDelete_WithStories",
			email: "user@example.com",
			series: models.Series{
				ID:    "series456",
				Title: "Series with Stories",
				Stories: []*models.Story{
					{ID: "story1", Title: "Story 1"},
					{ID: "story2", Title: "Story 2"},
					{ID: "story3", Title: "Story 3"},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "SuccessfulDelete_SingleStory",
			email: "user@example.com",
			series: models.Series{
				ID:    "series789",
				Title: "Series with One Story",
				Stories: []*models.Story{
					{ID: "story1", Title: "Only Story"},
				},
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name:  "DatabaseError",
			email: "user@example.com",
			series: models.Series{
				ID:    "series999",
				Title: "Test Series",
			},
			mockErr: errors.New("database delete error"),
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockDao.MockDeleteSeries = func(email string, series models.Series) error {
				if email != tc.email {
					t.Errorf("expected email %s, got %s", tc.email, email)
				}
				if series.ID != tc.series.ID {
					t.Errorf("expected series ID %s, got %s", tc.series.ID, series.ID)
				}
				return tc.mockErr
			}

			err := mockDao.DeleteSeries(context.Background(), tc.email, tc.series)

			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}

func BenchmarkGetAllSeriesWithStories(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetAllSeriesWithStories(context.Background(), "bench@example.com", false)
	}
}
