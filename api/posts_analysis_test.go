package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestAnalyzeChapterEndpoint_MissingStoryID(t *testing.T) {
	req := createTestRequestWithSession("POST", "/analyze//chapter123/type", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "",
		"chapterID": "chapter123",
		"type":      "analyze",
	})

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestAnalyzeChapterEndpoint_MissingChapterID(t *testing.T) {
	req := createTestRequestWithSession("POST", "/analyze/story123//type", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "story123",
		"chapterID": "",
		"type":      "analyze",
	})

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestAnalyzeChapterEndpoint_MissingAnalysisType(t *testing.T) {
	req := createTestRequestWithSession("POST", "/analyze/story123/chapter123/", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "story123",
		"chapterID": "chapter123",
		"type":      "",
	})

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestAnalyzeChapterEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("POST", "/analyze/story123/chapter123/analyze", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "story123",
		"chapterID": "chapter123",
		"type":      "analyze",
	})
	// No DAO in context

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestAnalyzeChapterEndpoint_BlockRetrievalError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		return nil, errors.New("failed to retrieve blocks")
	}

	req := createTestRequestWithSession("POST", "/analyze/story123/chapter123/analyze", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "story123",
		"chapterID": "chapter123",
		"type":      "analyze",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestAnalyzeChapterEndpoint_EmptyChapter(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		// Return empty blocks
		return &models.BlocksData{
			Items: []map[string]types.AttributeValue{},
		}, nil
	}

	req := createTestRequestWithSession("POST", "/analyze/story123/chapter123/analyze", nil)
	req = mux.SetURLVars(req, map[string]string{
		"storyID":   "story123",
		"chapterID": "chapter123",
		"type":      "analyze",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AnalyzeChapterEndpoint(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Expected status 422, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// Note: Full success tests for AnalyzeChapterEndpoint would require mocking:
// - HTTP client for OpenAI API calls
// - Environment variables (OPENAI_API_KEY)
// - External API responses
//
// These would be integration tests rather than unit tests. The tests above cover
// the validation and error handling paths that can be tested without external dependencies.
