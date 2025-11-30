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
	mockDAO.MockResetBlockOrder = func(storyID string, blocksOrder *models.BlocksOrder) error {
		return nil
	}

	blocksOrder := models.BlocksOrder{
		StoryID:   "story123",
		ChapterID: "ch1",
		Blocks:    []models.BlockOrder{{KeyID: "block1", Place: "1"}},
	}
	body, _ := json.Marshal(blocksOrder)

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
	blocksOrder := models.BlocksOrder{StoryID: "story123"}
	body, _ := json.Marshal(blocksOrder)

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
	mockDAO.MockResetBlockOrder = func(storyID string, blocksOrder *models.BlocksOrder) error {
		return daos.ErrMockDAO
	}

	blocksOrder := models.BlocksOrder{StoryID: "story123"}
	body, _ := json.Marshal(blocksOrder)

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
	mockDAO.MockResetBlockOrder = func(storyID string, blocksOrder *models.BlocksOrder) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "UpdateItem",
			Err:           daos.ErrMockDAO,
		}
	}

	blocksOrder := models.BlocksOrder{StoryID: "story123"}
	body, _ := json.Marshal(blocksOrder)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

// TestRewriteBlockOrderEndpoint_NoContentDataAccepted verifies that the ResetBlockOrder endpoint
// only accepts position data (keyID + place) and does not accept content (chunk) data.
// This test ensures the bug where empty chunks were accidentally sent to the reorder endpoint
// is prevented by the API contract itself (BlocksOrder model doesn't have a Chunk field).
func TestRewriteBlockOrderEndpoint_NoContentDataAccepted(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Track what data the DAO receives
	var receivedBlocksOrder *models.BlocksOrder
	mockDAO.MockResetBlockOrder = func(storyID string, blocksOrder *models.BlocksOrder) error {
		receivedBlocksOrder = blocksOrder
		return nil
	}

	// Create a request with BlockOrder (no chunk field)
	blocksOrder := models.BlocksOrder{
		StoryID:   "story123",
		ChapterID: "chapter1",
		Blocks: []models.BlockOrder{
			{KeyID: "block1", Place: "1"},
			{KeyID: "block2", Place: "2"},
			{KeyID: "block3", Place: "3"},
		},
	}
	body, _ := json.Marshal(blocksOrder)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/blocks/reorder", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	RewriteBlockOrderEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}

	// Verify the DAO received the correct data
	if receivedBlocksOrder == nil {
		t.Fatal("DAO was not called")
	}

	if receivedBlocksOrder.StoryID != "story123" {
		t.Errorf("Expected storyID 'story123', got '%s'", receivedBlocksOrder.StoryID)
	}

	if receivedBlocksOrder.ChapterID != "chapter1" {
		t.Errorf("Expected chapterID 'chapter1', got '%s'", receivedBlocksOrder.ChapterID)
	}

	if len(receivedBlocksOrder.Blocks) != 3 {
		t.Errorf("Expected 3 blocks, got %d", len(receivedBlocksOrder.Blocks))
	}

	// Verify the blocks only contain position data (KeyID and Place)
	for i, block := range receivedBlocksOrder.Blocks {
		if block.KeyID == "" {
			t.Errorf("Block %d: KeyID should not be empty", i)
		}
		if block.Place == "" {
			t.Errorf("Block %d: Place should not be empty", i)
		}
	}

	// This test also implicitly verifies at compile-time that BlockOrder doesn't have a Chunk field
	// If someone tries to add block.Chunk here, it won't compile
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
