package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

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

	req := createTestRequestWithSession("PUT", "/story/story123/export?type=pdf", bytes.NewBufferString("invalid json"))
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
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Test content</p>"},
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
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Test content</p>"},
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
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Test content</p>"},
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
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test"}, nil
	}

	exportReq := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Test content</p>"},
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

// --- Tests for validateExportRequest ---

func TestValidateExportRequest_Valid(t *testing.T) {
	author := "John Doe"
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Content</p>"},
		},
		Author: &author,
	}

	err := validateExportRequest(export)
	if err != nil {
		t.Errorf("Expected valid request to pass, got error: %v", err)
	}
}

func TestValidateExportRequest_EmptyTitle(t *testing.T) {
	export := models.DocumentExportRequest{
		Title:   "",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Content</p>"},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected empty title to fail validation")
	}
	if err != nil && err.Error() != "title is required" {
		t.Errorf("Expected 'title is required' error, got: %v", err)
	}
}

func TestValidateExportRequest_TitleTooLong(t *testing.T) {
	longTitle := string(make([]byte, 501))
	export := models.DocumentExportRequest{
		Title:   longTitle,
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Content</p>"},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected title too long to fail validation")
	}
}

func TestValidateExportRequest_EmptyStoryID(t *testing.T) {
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Content</p>"},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected empty story ID to fail validation")
	}
	if err != nil && err.Error() != "story ID is required" {
		t.Errorf("Expected 'story ID is required' error, got: %v", err)
	}
}

func TestValidateExportRequest_NoChapters(t *testing.T) {
	export := models.DocumentExportRequest{
		Title:         "Test Story",
		StoryID:       "story123",
		HtmlByChapter: []models.HTMLData{},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected no chapters to fail validation")
	}
	if err != nil && err.Error() != "at least one chapter is required" {
		t.Errorf("Expected 'at least one chapter is required' error, got: %v", err)
	}
}

func TestValidateExportRequest_EmptyChapterTitle(t *testing.T) {
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "", HTML: "<p>Content</p>"},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected empty chapter title to fail validation")
	}
}

func TestValidateExportRequest_ChapterTitleTooLong(t *testing.T) {
	longChapterTitle := string(make([]byte, 501))
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: longChapterTitle, HTML: "<p>Content</p>"},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected chapter title too long to fail validation")
	}
}

func TestValidateExportRequest_ChapterContentTooLarge(t *testing.T) {
	largeContent := string(make([]byte, 11*1024*1024)) // 11MB
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: largeContent},
		},
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected chapter content too large to fail validation")
	}
}

func TestValidateExportRequest_TooManyChapters(t *testing.T) {
	chapters := make([]models.HTMLData, 1001)
	for i := range chapters {
		chapters[i] = models.HTMLData{
			Chapter: "Chapter",
			HTML:    "<p>Content</p>",
		}
	}

	export := models.DocumentExportRequest{
		Title:         "Test Story",
		StoryID:       "story123",
		HtmlByChapter: chapters,
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected too many chapters to fail validation")
	}
}

func TestValidateExportRequest_AuthorTooLong(t *testing.T) {
	longAuthor := string(make([]byte, 201))
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: "<p>Content</p>"},
		},
		Author: &longAuthor,
	}

	err := validateExportRequest(export)
	if err == nil {
		t.Error("Expected author too long to fail validation")
	}
}

func TestValidateExportRequest_EmptyHTMLAllowed(t *testing.T) {
	export := models.DocumentExportRequest{
		Title:   "Test Story",
		StoryID: "story123",
		HtmlByChapter: []models.HTMLData{
			{Chapter: "Chapter 1", HTML: ""},
		},
	}

	err := validateExportRequest(export)
	if err != nil {
		t.Errorf("Expected empty HTML to be allowed, got error: %v", err)
	}
}
