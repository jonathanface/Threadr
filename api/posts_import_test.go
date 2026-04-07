package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func createImportRequest(t *testing.T, storyID string, filename string, content string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("Failed to create form file: %v", err)
	}
	part.Write([]byte(content))
	writer.Close()

	req := createTestRequestWithSession("POST", "/stories/"+storyID+"/import", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{"storyID": storyID})
	return req
}

func TestImportDocument_OwnershipCheck(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return nil, sql.ErrNoRows // user doesn't own the story
	}

	req := createImportRequest(t, "story-not-mine", "test.txt", "Some content")
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403 for non-owner, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestImportDocument_MissingFile(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}

	req := createTestRequestWithSession("POST", "/stories/story123/import", nil)
	req.Header.Set("Content-Type", "multipart/form-data")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing file, got %d", rr.Code)
	}
}

func TestImportDocument_UnsupportedFormat(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}

	req := createImportRequest(t, "story123", "script.exe", "malicious content")
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for .exe file, got %d", rr.Code)
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte("Unsupported file format")) {
		t.Errorf("Expected unsupported format message, got: %s", rr.Body.String())
	}
}

func TestImportDocument_TxtSuccess(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test"}, nil
	}

	var createdChapters []models.Chapter
	mockDAO.MockCreateChapter = func(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
		createdChapters = append(createdChapters, chapter)
		return chapter, nil
	}

	var writtenBlocks int
	mockDAO.MockWriteBlocks = func(storyID string, blocks *models.StoryBlocks) error {
		writtenBlocks += len(blocks.Blocks)
		return nil
	}

	content := "First paragraph of the story.\n\nSecond paragraph with more content."
	req := createImportRequest(t, "story123", "novel.txt", content)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// TXT files become 1 chapter
	if len(createdChapters) != 1 {
		t.Errorf("Expected 1 chapter, got %d", len(createdChapters))
	}
	if writtenBlocks == 0 {
		t.Error("Expected blocks to be written")
	}

	var response map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["count"] != float64(1) {
		t.Errorf("Expected count 1, got %v", response["count"])
	}
}

func TestImportDocument_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createImportRequest(t, "", "test.txt", "content")
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for empty story ID, got %d", rr.Code)
	}
}

func TestImportDocument_ErrorMessagesSanitized(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(email, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}

	// A .docx that's actually just text will fail pandoc conversion
	req := createImportRequest(t, "story123", "fake.docx", "not a real docx")
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ImportDocumentEndpoint(rr, req)

	// Should fail but not leak internal error details
	body := rr.Body.String()
	if bytes.Contains(rr.Body.Bytes(), []byte("pandoc")) {
		t.Errorf("Error response should not contain internal tool names: %s", body)
	}
	if bytes.Contains(rr.Body.Bytes(), []byte("/tmp/")) {
		t.Errorf("Error response should not contain file paths: %s", body)
	}
}
