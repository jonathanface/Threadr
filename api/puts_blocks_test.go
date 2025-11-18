package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
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

func TestRewriteBlockOrderEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockResetBlockOrder = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return nil
	}

	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
		Blocks:    []models.StoryBlock{{KeyID: "block1", Place: "1"}},
	}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestRewriteBlockOrderEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story//blocks/reorder", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": ""})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected missing story ID error, got: %s", response["error"])
	}
}

func TestRewriteBlockOrderEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestRewriteBlockOrderEndpoint_NoDAO(t *testing.T) {
	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestRewriteBlockOrderEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockResetBlockOrder = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return daos.ErrMockDAO
	}

	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestRewriteBlockOrderEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockResetBlockOrder = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "UpdateItem",
			Err:           daos.ErrMockDAO,
		}
	}

	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteBlocksToStoryEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockWriteBlocks = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return nil
	}

	storyBlocks := models.StoryBlocks{
		StoryID:   "story123",
		ChapterID: "ch1",
		Blocks:    []models.StoryBlock{{KeyID: "block1", Place: "1"}},
	}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestWriteBlocksToStoryEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story//blocks", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": ""})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestWriteBlocksToStoryEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestWriteBlocksToStoryEndpoint_NoDAO(t *testing.T) {
	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteBlocksToStoryEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockWriteBlocks = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return daos.ErrMockDAO
	}

	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteBlocksToStoryEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockWriteBlocks = func(storyID string, storyBlocks *models.StoryBlocks) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	storyBlocks := models.StoryBlocks{StoryID: "story123"}
	body, _ := json.Marshal(storyBlocks)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteBlocksToStoryEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}
