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

func TestCreateStoryChapterEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		// Return the chapter with an ID assigned
		chapter.ID = "new-chapter-id"
		return chapter, nil
	}

	chapter := models.Chapter{
		Title: "New Chapter",
		Place: 1,
	}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

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
	if response.Title != "New Chapter" {
		t.Errorf("Expected title 'New Chapter', got %s", response.Title)
	}
	if response.ID == "" {
		t.Errorf("Expected chapter to have an ID assigned")
	}
}

func TestCreateStoryChapterEndpoint_DefaultPlace(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
		// Check that Place was set to 1 if it was 0
		if chapter.Place != 1 {
			t.Errorf("Expected Place to be set to 1, got %d", chapter.Place)
		}
		chapter.ID = "new-chapter-id"
		return chapter, nil
	}

	chapter := models.Chapter{
		Title: "New Chapter",
		Place: 0, // Should be set to 1
	}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}
}

func TestCreateStoryChapterEndpoint_NoSession(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	chapter := models.Chapter{Title: "New Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateStoryChapterEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	chapter := models.Chapter{Title: "New Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story//chapter", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected missing story ID error, got: %s", response["error"])
	}
}

func TestCreateStoryChapterEndpoint_NoDAO(t *testing.T) {
	chapter := models.Chapter{Title: "New Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got: %s", response["error"])
	}
}

func TestCreateStoryChapterEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Invalid request payload" {
		t.Errorf("Expected invalid payload error, got: %s", response["error"])
	}
}

func TestCreateStoryChapterEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
		return models.Chapter{}, daos.ErrMockDAO
	}

	chapter := models.Chapter{Title: "New Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateStoryChapterEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
		return models.Chapter{}, &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	chapter := models.Chapter{Title: "New Chapter"}
	body, _ := json.Marshal(chapter)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/chapter", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateStoryChapterEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}
