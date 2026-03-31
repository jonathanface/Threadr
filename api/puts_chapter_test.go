package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestUpdateChaptersEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
		return chapter, nil
	}

	chapters := []models.Chapter{
		{ID: "ch1", Title: "Chapter 1", Place: 1},
		{ID: "ch2", Title: "Chapter 2", Place: 2},
	}
	body, _ := json.Marshal(chapters)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapters", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response []models.Chapter
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if len(response) != 2 {
		t.Errorf("Expected 2 chapters, got %d", len(response))
	}
}

func TestUpdateChaptersEndpoint_NoDAO(t *testing.T) {
	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapters", nil)

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got: %s", response["error"])
	}
}

func TestUpdateChaptersEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story//chapters", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected missing story ID error, got: %s", response["error"])
	}
}

func TestUpdateChaptersEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapters", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestUpdateChaptersEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
		return models.Chapter{}, daos.ErrMockDAO
	}

	chapters := []models.Chapter{{ID: "ch1", Title: "Chapter 1"}}
	body, _ := json.Marshal(chapters)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapters", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestUpdateChaptersEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
		return models.Chapter{}, &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "UpdateItem",
			Err:           daos.ErrMockDAO,
		}
	}

	chapters := []models.Chapter{{ID: "ch1", Title: "Chapter 1"}}
	body, _ := json.Marshal(chapters)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapters", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	w := httptest.NewRecorder()

	UpdateChaptersEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestEditChapterEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
		if chapter.ID != "ch1" {
			t.Errorf("Expected chapterID ch1, got %s", chapter.ID)
		}
		return chapter, nil
	}

	chapter := models.Chapter{ID: "ch1", Title: "Updated Chapter", Place: 1}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapter/ch1", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})

	w := httptest.NewRecorder()

	EditChapterEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response models.Chapter
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if response.Title != "Updated Chapter" {
		t.Errorf("Expected title 'Updated Chapter', got %s", response.Title)
	}
}

func TestEditChapterEndpoint_MissingChapterID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapter/", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": ""})

	w := httptest.NewRecorder()

	EditChapterEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing chapter ID" {
		t.Errorf("Expected missing chapter ID error, got: %s", response["error"])
	}
}

func TestEditChapterEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapter/ch1", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})

	w := httptest.NewRecorder()

	EditChapterEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestEditChapterEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockEditChapter = func(storyID string, chapter models.Chapter) (models.Chapter, error) {
		return models.Chapter{}, daos.ErrMockDAO
	}

	chapter := models.Chapter{ID: "ch1", Title: "Updated Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/chapter/ch1", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})

	w := httptest.NewRecorder()

	EditChapterEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}
