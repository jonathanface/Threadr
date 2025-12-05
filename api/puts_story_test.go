package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/smithy-go"
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

func TestRemoveStoryFromSeriesEndpoint_MissingSeriesID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/series//remove/story1", nil)
	req = mux.SetURLVars(req, map[string]string{
		"seriesID": "",
		"storyID":  "story1",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RemoveStoryFromSeriesEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestRemoveStoryFromSeriesEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("PUT", "/series/series123/remove/story1", nil)
	req = mux.SetURLVars(req, map[string]string{
		"seriesID": "series123",
		"storyID":  "story1",
	})
	// No DAO in context

	rr := httptest.NewRecorder()
	RemoveStoryFromSeriesEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestEditSeriesEndpoint_NoDAO(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("series_name", "New Series Title")
	writer.Close()

	req := createTestRequestWithSession("PUT", "/series/series123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"seriesID": "series123"})
	// No DAO in context

	rr := httptest.NewRecorder()
	EditSeriesEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
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

func TestEditStoryEndpoint_ParseMultipartFormError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}

	// Create a request with invalid content type for multipart form
	body := &bytes.Buffer{}
	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", "text/plain") // Wrong content type
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStoryEndpoint_InvalidTitle(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	// Create a title that's too long (over 256 chars)
	longTitle := strings.Repeat("a", 257)
	writer.WriteField("title", longTitle)
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStoryEndpoint_InvalidDescription(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:          storyID,
			Title:       "Original Title",
			Description: "Original Description",
		}, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	// Create a description that's too long (over 5000 chars)
	longDesc := strings.Repeat("a", 5001)
	writer.WriteField("description", longDesc)
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStoryEndpoint_WithSeriesID(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}
	mockDAO.MockEditStory = func(email string, story models.Story) (models.Story, error) {
		// Verify that SeriesID was set
		if story.SeriesID != "series456" {
			t.Errorf("Expected SeriesID 'series456', got '%s'", story.SeriesID)
		}
		return story, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("series_id", "series456")
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

func TestEditStoryEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}
	mockDAO.MockEditStory = func(email string, story models.Story) (models.Story, error) {
		return models.Story{}, &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("title", "Updated Title")
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEditStoryEndpoint_DAOEditError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{
			ID:    storyID,
			Title: "Original Title",
		}, nil
	}
	mockDAO.MockEditStory = func(email string, story models.Story) (models.Story, error) {
		return models.Story{}, errors.New("database error")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("title", "Updated Title")
	writer.Close()

	req := createTestRequestWithSession("PUT", "/story/story123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	EditStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
