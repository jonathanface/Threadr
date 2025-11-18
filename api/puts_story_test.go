package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestEditSeriesEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetSeriesByID = func(email, seriesID string) (*models.Series, error) {
		return &models.Series{
			ID:    seriesID,
			Title: "Original Title",
		}, nil
	}
	mockDAO.MockEditSeries = func(email string, series models.Series) (models.Series, error) {
		return series, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("series_name", "New Series Title")
	writer.WriteField("series_description", "New Description")
	writer.Close()

	req := createTestRequestWithSession("PUT", "/series/series123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"seriesID": "series123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditSeriesEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditSeriesEndpoint_MissingSeriesID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/series/", nil)
	req = mux.SetURLVars(req, map[string]string{"seriesID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditSeriesEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestEditSeriesEndpoint_SeriesNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.Close()

	req := createTestRequestWithSession("PUT", "/series/series123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"seriesID": "series123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditSeriesEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", rr.Code)
	}
}

func TestRemoveStoryFromSeriesEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Story 1",
		}, nil
	}
	mockDAO.MockGetSeriesByID = func(email, seriesID string) (*models.Series, error) {
		story1 := models.Story{ID: "story1", Title: "Story 1"}
		story2 := models.Story{ID: "story2", Title: "Story 2"}
		return &models.Series{
			ID:      seriesID,
			Title:   "Test Series",
			Stories: []*models.Story{&story1, &story2},
		}, nil
	}
	mockDAO.MockRemoveStoryFromSeries = func(email, storyID string, series models.Series) (models.Series, error) {
		return series, nil
	}

	req := createTestRequestWithSession("PUT", "/series/series123/remove/story1", nil)
	req = mux.SetURLVars(req, map[string]string{
		"seriesID": "series123",
		"storyID":  "story1",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RemoveStoryFromSeriesEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRemoveStoryFromSeriesEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/series/series123/remove/", nil)
	req = mux.SetURLVars(req, map[string]string{
		"seriesID": "series123",
		"storyID":  "",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RemoveStoryFromSeriesEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestEditStoryEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}
	mockDAO.MockEditStory = func(email string, story models.Story) (models.Story, error) {
		return story, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("story_name", "Updated Story Title")
	writer.WriteField("story_description", "Updated Description")
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStoryEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/story/", nil)
	req = mux.SetURLVars(req, map[string]string{"story": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestEditStoryEndpoint_StoryNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", rr.Code)
	}
}

func TestEditStorySettingsEndPoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStorySettingsByID = func(email, storyID string) (*models.StorySettings, error) {
		return &models.StorySettings{}, nil
	}
	mockDAO.MockUpdateStorySettings = func(email, storyID string, settings models.StorySettings) error {
		return nil
	}

	settings := models.StorySettings{
		Spellcheck: true,
		Autotab:    false,
	}
	body, _ := json.Marshal(settings)

	req := createTestRequestWithSession("PUT", "/story/story123/settings", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStorySettingsEndPoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStorySettingsEndPoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/story/story123/settings", bytes.NewBuffer([]byte("invalid json")))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStorySettingsEndPoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestEditStoryEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("PUT", "/story/story123", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}
