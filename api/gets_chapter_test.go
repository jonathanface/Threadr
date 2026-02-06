package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

// ChapterTableStatusEndpoint tests

func TestChapterTableStatusEndpoint_Success_TableReady(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetChapterTableStatus = func(storyID, chapterID string) (bool, error) {
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if chapterID != "ch1" {
			t.Errorf("Expected chapterID ch1, got %s", chapterID)
		}
		return true, nil
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestChapterTableStatusEndpoint_TableNotReady(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetChapterTableStatus = func(storyID, chapterID string) (bool, error) {
		return false, nil
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "table not ready" {
		t.Errorf("Expected 'table not ready' error, got '%s'", response["error"])
	}
}

func TestChapterTableStatusEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story//chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story id" {
		t.Errorf("Expected 'Missing story id' error, got '%s'", response["error"])
	}
}

func TestChapterTableStatusEndpoint_MissingChapterID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story/story123/chapter//status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing chapter id" {
		t.Errorf("Expected 'Missing chapter id' error, got '%s'", response["error"])
	}
}

func TestChapterTableStatusEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	// No DAO in context

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestChapterTableStatusEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetChapterTableStatus = func(storyID, chapterID string) (bool, error) {
		return false, errors.New("database error")
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestChapterTableStatusEndpoint_UnauthorizedAccess(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	// Return error to simulate user doesn't own the story
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return nil, errors.New("story not found")
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1/status", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterTableStatusEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ChapterDetailsEndpoint tests

func TestChapterDetailsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetChapterByID = func(chapterID string) (*models.Chapter, error) {
		if chapterID != "ch1" {
			t.Errorf("Expected chapterID ch1, got %s", chapterID)
		}
		return &models.Chapter{
			ID:    chapterID,
			Title: "Test Chapter",
			Place: 1,
		}, nil
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
		return
	}

	var chapter models.Chapter
	err := json.NewDecoder(rr.Body).Decode(&chapter)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if chapter.ID != "ch1" {
		t.Errorf("Expected chapter ID ch1, got %s", chapter.ID)
	}
	if chapter.Title != "Test Chapter" {
		t.Errorf("Expected title 'Test Chapter', got %s", chapter.Title)
	}
}

func TestChapterDetailsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story//chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story id" {
		t.Errorf("Expected 'Missing story id' error, got '%s'", response["error"])
	}
}

func TestChapterDetailsEndpoint_MissingChapterID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story/story123/chapter/", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing chapter id" {
		t.Errorf("Expected 'Missing chapter id' error, got '%s'", response["error"])
	}
}

func TestChapterDetailsEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	// No DAO in context

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestChapterDetailsEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetChapterByID = func(chapterID string) (*models.Chapter, error) {
		return nil, errors.New("database error")
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestChapterDetailsEndpoint_UnauthorizedAccess(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	// Return error to simulate user doesn't own the story
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return nil, errors.New("story not found")
	}

	req := createTestRequestWithSession("GET", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ChapterDetailsEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
