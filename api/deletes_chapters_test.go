package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestDeleteChaptersEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapters = func(storyID string, chapters []models.Chapter) error {
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if len(chapters) != 1 {
			t.Errorf("Expected 1 chapter, got %d", len(chapters))
		}
		if chapters[0].ID != "ch1" {
			t.Errorf("Expected chapterID ch1, got %s", chapters[0].ID)
		}
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteChaptersEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story//chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected 'Missing story ID' error, got '%s'", response["error"])
	}
}

func TestDeleteChaptersEndpoint_MissingChapterID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story/story123/chapter/", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing chapter ID" {
		t.Errorf("Expected 'Missing chapter ID' error, got '%s'", response["error"])
	}
}

func TestDeleteChaptersEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("DELETE", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	// No DAO in context

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestDeleteChaptersEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapters = func(storyID string, chapters []models.Chapter) error {
		return daos.ErrMockDAO
	}

	req := createTestRequestWithSession("DELETE", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestDeleteChaptersEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapters = func(storyID string, chapters []models.Chapter) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "DeleteItem",
			Err:           daos.ErrMockDAO,
		}
	}

	req := createTestRequestWithSession("DELETE", "/story/story123/chapter/ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "chapterID": "ch1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteChaptersEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
