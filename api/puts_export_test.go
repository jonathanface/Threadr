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

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestExportStoryEndpoint_MissingType(t *testing.T) {
	req := createTestRequestWithSession("PUT", "/story/story123/export", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "no type provided" {
		t.Errorf("Expected error message 'no type provided', got '%s'", response["error"])
	}
}

func TestExportStoryEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/story/story123/export?type=pdf", bytes.NewBuffer([]byte("invalid json")))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestExportStoryEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	exportReq := models.DocumentExportRequest{
		Title: "Test Story",
		HtmlByChapter: []models.HTMLData{
			{HTML: "<p>Test content</p>"},
		},
	}

	body, _ := json.Marshal(exportReq)

	req := createTestRequestWithSession("PUT", "/story//export?type=pdf", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestExportStoryEndpoint_NoDAO(t *testing.T) {
	exportReq := models.DocumentExportRequest{
		Title: "Test Story",
		HtmlByChapter: []models.HTMLData{
			{HTML: "<p>Test content</p>"},
		},
	}

	body, _ := json.Marshal(exportReq)

	req := createTestRequestWithSession("PUT", "/story/story123/export?type=pdf", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	// No DAO in context

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestExportStoryEndpoint_StoryNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	exportReq := models.DocumentExportRequest{
		Title: "Test Story",
		HtmlByChapter: []models.HTMLData{
			{HTML: "<p>Test content</p>"},
		},
	}

	body, _ := json.Marshal(exportReq)

	req := createTestRequestWithSession("PUT", "/story/story123/export?type=pdf", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestExportStoryEndpoint_DatabaseError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test"}, nil
	}

	exportReq := models.DocumentExportRequest{
		Title: "Test Story",
		HtmlByChapter: []models.HTMLData{
			{HTML: "<p>Test content</p>"},
		},
	}

	body, _ := json.Marshal(exportReq)

	req := createTestRequestWithSession("PUT", "/story/story123/export?type=pdf", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ExportStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)

// Note: Full success tests for ExportStoryEndpoint would require mocking:
// - AWS config loading
// - File system operations (os.Remove, os.Open)
// - S3 client operations
// - Document conversion functions (converters.HTMLToPDF, etc.)
//
// These would be integration tests rather than unit tests and would require
// more complex mocking infrastructure. The tests above cover the validation
// and error handling paths that can be tested without external dependencies.
	}
}
