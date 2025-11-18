package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

// createTestImage creates a small test PNG image
func createTestImage(width, height int) *bytes.Buffer {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	buf := new(bytes.Buffer)
	png.Encode(buf, img)
	return buf
}

func TestUploadPortraitEndpoint_MissingStoryID(t *testing.T) {
	req := createTestRequestWithSession("POST", "/upload//assoc123", nil)
	req = mux.SetURLVars(req, map[string]string{
		"story":       "",
		"association": "assoc123",
	})

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestUploadPortraitEndpoint_MissingAssociationID(t *testing.T) {
	req := createTestRequestWithSession("POST", "/upload/story123/", nil)
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "",
	})

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestUploadPortraitEndpoint_MissingAssociationType(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestUploadPortraitEndpoint_MissingFile(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123?type=character", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestUploadPortraitEndpoint_InvalidFileType(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Create a text file instead of an image
	part, _ := writer.CreateFormFile("file", "test.txt")
	part.Write([]byte("This is not an image"))
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123?type=character", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for invalid file type, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestUploadPortraitEndpoint_NoDAO(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123?type=character", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})
	// No DAO in context

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestUploadPortraitEndpoint_AssociationNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockUpdateAssociationPortraitEntryInDB = func(email, storyOrSeriesID, associationID, url string) error {
		return sql.ErrNoRows
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123?type=character", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestUploadPortraitEndpoint_EditAssociationError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockUpdateAssociationPortraitEntryInDB = func(email, storyOrSeriesID, associationID, url string) error {
		return errors.New("database error")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	imgBuf := createTestImage(100, 100)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(imgBuf.Bytes())
	writer.Close()

	req := createTestRequestWithSession("POST", "/upload/story123/assoc123?type=character", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = mux.SetURLVars(req, map[string]string{
		"story":       "story123",
		"association": "assoc123",
	})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	UploadPortraitEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}
