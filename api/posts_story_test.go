package api

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/smithy-go"
)

func init() {
	SetupTestSession()
}

func TestCreateStoryEndpoint_MissingFile(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateStoryEndpoint_InvalidFileType(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Create a text file instead of an image
	part, _ := writer.CreateFormFile("file", "test.txt")
	part.Write([]byte("This is not an image"))

	writer.WriteField("title", "Test Story")
	writer.WriteField("description", "Test Description")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for invalid file type, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateStoryEndpoint_MissingTitle(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())

	writer.WriteField("title", "")
	writer.WriteField("description", "Test Description")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateStoryEndpoint_MissingDescription(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())

	writer.WriteField("title", "Test Story")
	writer.WriteField("description", "")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestCreateStoryEndpoint_NoDAO(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())

	writer.WriteField("title", "Test Story")
	writer.WriteField("description", "Test Description")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	// No DAO in context

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestCreateStoryEndpoint_CreateStoryError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateStory = func(email string, story models.Story, seriesTitle string) (string, error) {
		return "", errors.New("database error")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())

	writer.WriteField("title", "Test Story")
	writer.WriteField("description", "Test Description")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateStoryEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateStory = func(email string, story models.Story, seriesTitle string) (string, error) {
		return "", &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())

	writer.WriteField("title", "Test Story")
	writer.WriteField("description", "Test Description")
	writer.Close()

	req := createTestRequestWithSession("POST", "/story", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)

		// Note: Full success tests for CreateStoryEndpoint would require mocking:
		// - AWS config loading
		// - S3 client operations
		// - UUID generation
		// - File system operations
		//
		// These would be integration tests rather than unit tests. The tests above cover
		// the validation and error handling paths that can be tested without external dependencies.
	}
}
