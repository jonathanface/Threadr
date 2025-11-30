package daos

import (
	"RichDocter/models"
	"context"
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

func BenchmarkGetAllSeriesWithStories(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetAllSeriesWithStories(context.Background(), "bench@example.com", false)
	}
}
