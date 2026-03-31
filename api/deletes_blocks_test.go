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

func TestDeleteBlocksFromStoryEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapterParagraphs = func(storyID string, storyBlocks *models.StoryBlocks) error {
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		return nil
	}

	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
		Blocks:    []models.StoryBlock{{KeyID: "block1", Place: "1"}},
	}
	body, _ := json.Marshal(storyBlocks)

	req := createTestRequestWithSession("DELETE", "/story/story123/blocks", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteBlocksFromStoryEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story//blocks", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected 'Missing story ID' error, got '%s'", response["error"])
	}
}

func TestDeleteBlocksFromStoryEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story/story123/blocks", bytes.NewBuffer([]byte("invalid json")))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestDeleteBlocksFromStoryEndpoint_NoDAO(t *testing.T) {
	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
	}
	body, _ := json.Marshal(storyBlocks)

	req := createTestRequestWithSession("DELETE", "/story/story123/blocks", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	// No DAO in context

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestDeleteBlocksFromStoryEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapterParagraphs = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return daos.ErrMockDAO
	}

	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
	}
	body, _ := json.Marshal(storyBlocks)

	req := createTestRequestWithSession("DELETE", "/story/story123/blocks", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestDeleteBlocksFromStoryEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email string, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	mockDAO.MockDeleteChapterParagraphs = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "DeleteItem",
			Err:           daos.ErrMockDAO,
		}
	}

	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
	}
	body, _ := json.Marshal(storyBlocks)

	req := createTestRequestWithSession("DELETE", "/story/story123/blocks", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteBlocksFromStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
