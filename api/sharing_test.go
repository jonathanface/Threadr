package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
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

// ============================================================
// CreateShareLinkEndpoint tests
// ============================================================

func TestCreateShareLinkEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, _ string) ([]models.ShareLink, error) {
		return []models.ShareLink{}, nil
	}
	mockDAO.MockCreateShareLink = func(_ models.ShareLink) error {
		return nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
		CommentsEnabled: true,
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var link models.ShareLink
	if err := json.Unmarshal(rr.Body.Bytes(), &link); err != nil {
		t.Errorf("Failed to unmarshal response: %v", err)
	}
	if link.Token == "" {
		t.Error("Expected non-empty token in response")
	}
	if link.StoryID != "story123" {
		t.Errorf("Expected story_id 'story123', got '%s'", link.StoryID)
	}
	if link.ReaderEmail != "reader@test.com" {
		t.Errorf("Expected reader_email 'reader@test.com', got '%s'", link.ReaderEmail)
	}
}

func TestCreateShareLinkEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
	})

	req := createTestRequestWithSession("POST", "/stories//share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_MissingReaderEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, _ string) ([]models.ShareLink, error) {
		return []models.ShareLink{}, nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_InvalidEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "not-an-email",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_MissingNames(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail: "reader@test.com",
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_StoryNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
		return nil, sql.ErrNoRows
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_DuplicateReader(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, _ string) ([]models.ShareLink, error) {
		return []models.ShareLink{
			{Token: "existing-token", ReaderEmail: "reader@test.com", Revoked: false},
		}, nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateShareLinkEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, _ string) ([]models.ShareLink, error) {
		return []models.ShareLink{}, nil
	}
	mockDAO.MockCreateShareLink = func(_ models.ShareLink) error {
		return errors.New("database error")
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
		CommentsEnabled: true,
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// GetShareLinksEndpoint tests
// ============================================================

func TestGetShareLinksEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, storyID string) ([]models.ShareLink, error) {
		return []models.ShareLink{
			{Token: "token1", StoryID: storyID, ReaderEmail: "reader1@test.com"},
			{Token: "token2", StoryID: storyID, ReaderEmail: "reader2@test.com"},
		}, nil
	}

	req := createTestRequestWithSession("GET", "/stories/story123/share", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetShareLinksEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var links []models.ShareLink
	if err := json.Unmarshal(rr.Body.Bytes(), &links); err != nil {
		t.Errorf("Failed to unmarshal response: %v", err)
	}
	if len(links) != 2 {
		t.Errorf("Expected 2 links, got %d", len(links))
	}
}

func TestGetShareLinksEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/stories//share", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetShareLinksEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestGetShareLinksEndpoint_StoryNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("GET", "/stories/story123/share", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetShareLinksEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// RevokeShareLinkEndpoint tests
// ============================================================

func TestRevokeShareLinkEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "test@example.com", StoryID: "story123"}, nil
	}
	mockDAO.MockRevokeShareLink = func(_ string) error {
		return nil
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/revoke", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RevokeShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRevokeShareLinkEndpoint_MissingToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/share//revoke", nil)
	req = mux.SetURLVars(req, map[string]string{"token": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RevokeShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRevokeShareLinkEndpoint_LinkNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(_ string) (*models.ShareLink, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/revoke", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RevokeShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRevokeShareLinkEndpoint_NotOwner(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "other@example.com", StoryID: "story123"}, nil
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/revoke", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RevokeShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// RestoreShareLinkEndpoint tests
// ============================================================

func TestRestoreShareLinkEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "test@example.com", StoryID: "story123"}, nil
	}
	mockDAO.MockRestoreShareLink = func(_ string) error {
		return nil
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/restore", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RestoreShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRestoreShareLinkEndpoint_MissingToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/share//restore", nil)
	req = mux.SetURLVars(req, map[string]string{"token": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RestoreShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRestoreShareLinkEndpoint_LinkNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(_ string) (*models.ShareLink, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/restore", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RestoreShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestRestoreShareLinkEndpoint_NotOwner(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "other@example.com", StoryID: "story123"}, nil
	}

	req := createTestRequestWithSession("PUT", "/share/test-token/restore", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RestoreShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// DeleteShareLinkEndpoint tests
// ============================================================

func TestDeleteShareLinkEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "test@example.com", StoryID: "story123"}, nil
	}
	mockDAO.MockDeleteShareLink = func(_ string) error {
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/share/test-token", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteShareLinkEndpoint_MissingToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/share/", nil)
	req = mux.SetURLVars(req, map[string]string{"token": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteShareLinkEndpoint_LinkNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(_ string) (*models.ShareLink, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("DELETE", "/share/test-token", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteShareLinkEndpoint_NotOwner(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		return &models.ShareLink{Token: token, AuthorEmail: "other@example.com", StoryID: "story123"}, nil
	}

	req := createTestRequestWithSession("DELETE", "/share/test-token", nil)
	req = mux.SetURLVars(req, map[string]string{"token": "test-token"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// GetAuthorCommentsEndpoint tests
// ============================================================

func TestGetAuthorCommentsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetCommentsByStoryChapter = func(storyID, chapterID string) ([]models.Comment, error) {
		return []models.Comment{
			{CommentID: "c1", StoryID: storyID, ChapterID: chapterID, Body: "Great chapter!"},
			{CommentID: "c2", StoryID: storyID, ChapterID: chapterID, Body: "Nice work."},
		}, nil
	}

	req := createTestRequestWithSession("GET", "/stories/story123/comments?chapter=ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetAuthorCommentsEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var comments []models.Comment
	if err := json.Unmarshal(rr.Body.Bytes(), &comments); err != nil {
		t.Errorf("Failed to unmarshal response: %v", err)
	}
	if len(comments) != 2 {
		t.Errorf("Expected 2 comments, got %d", len(comments))
	}
}

func TestGetAuthorCommentsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/stories//comments?chapter=ch1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetAuthorCommentsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestGetAuthorCommentsEndpoint_MissingChapterParam(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}

	req := createTestRequestWithSession("GET", "/stories/story123/comments", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetAuthorCommentsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// ResolveCommentEndpoint tests
// ============================================================

func TestResolveCommentEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(commentID string) (*models.Comment, error) {
		return &models.Comment{CommentID: commentID, StoryID: "story123", Body: "A comment"}, nil
	}
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockResolveComment = func(_ string) error {
		return nil
	}

	req := createTestRequestWithSession("PUT", "/comments/c1/resolve", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ResolveCommentEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestResolveCommentEndpoint_MissingCommentID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/comments//resolve", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ResolveCommentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestResolveCommentEndpoint_CommentNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(_ string) (*models.Comment, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("PUT", "/comments/c1/resolve", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ResolveCommentEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestResolveCommentEndpoint_NotOwner(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(commentID string) (*models.Comment, error) {
		return &models.Comment{CommentID: commentID, StoryID: "story123", Body: "A comment"}, nil
	}
	mockDAO.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
		return nil, errors.New("not your story")
	}

	req := createTestRequestWithSession("PUT", "/comments/c1/resolve", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	ResolveCommentEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// DeleteCommentEndpoint tests
// ============================================================

func TestDeleteCommentEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(commentID string) (*models.Comment, error) {
		return &models.Comment{CommentID: commentID, StoryID: "story123", Body: "A comment"}, nil
	}
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockDeleteComment = func(_ string) error {
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/comments/c1", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteCommentEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteCommentEndpoint_MissingCommentID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/comments/", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteCommentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteCommentEndpoint_CommentNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(_ string) (*models.Comment, error) {
		return nil, sql.ErrNoRows
	}

	req := createTestRequestWithSession("DELETE", "/comments/c1", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteCommentEndpoint(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteCommentEndpoint_NotOwner(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetComment = func(commentID string) (*models.Comment, error) {
		return &models.Comment{CommentID: commentID, StoryID: "story123", Body: "A comment"}, nil
	}
	mockDAO.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
		return nil, errors.New("not your story")
	}

	req := createTestRequestWithSession("DELETE", "/comments/c1", nil)
	req = mux.SetURLVars(req, map[string]string{"commentID": "c1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteCommentEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// GetSharedStoryEndpoint tests (public/reader-side)
// ============================================================

func newSharedRequest(url string, mockDAO *daos.MockDAO, link *models.ShareLink) *http.Request {
	req := httptest.NewRequest(http.MethodGet, url, nil)
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	return req.WithContext(ctx)
}

func defaultShareLink() *models.ShareLink {
	return &models.ShareLink{
		Token:           "test-token",
		StoryID:         "story123",
		CommentsEnabled: true,
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
		AuthorEmail:     "author@test.com",
	}
}

func TestGetSharedStoryEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Shared Story", Description: "A great story"}, nil
	}
	// GetChaptersByStoryID falls through to the embedded DAO, which uses MockDynamoClient.MockQuery
	// returning an empty QueryOutput by default, resulting in an empty chapters list.

	link := defaultShareLink()
	req := newSharedRequest("/shared/story", mockDAO, link)

	rr := httptest.NewRecorder()
	GetSharedStoryEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("Failed to unmarshal response: %v", err)
	}
	if response["story_id"] != "story123" {
		t.Errorf("Expected story_id 'story123', got '%v'", response["story_id"])
	}
	if response["title"] != "Shared Story" {
		t.Errorf("Expected title 'Shared Story', got '%v'", response["title"])
	}
	if response["comments_enabled"] != true {
		t.Errorf("Expected comments_enabled true, got '%v'", response["comments_enabled"])
	}
}

func TestGetSharedStoryEndpoint_NoShareLinkInContext(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodGet, "/shared/story", nil)
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	GetSharedStoryEndpoint(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// GetSharedContentEndpoint tests (public/reader-side)
// ============================================================

func TestGetSharedContentEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		return &models.BlocksData{
			Items: []map[string]types.AttributeValue{
				{"block_id": &types.AttributeValueMemberS{Value: "block1"}},
			},
			LastEvaluated: nil,
		}, nil
	}

	link := defaultShareLink()
	req := newSharedRequest("/shared/content?chapter=ch1", mockDAO, link)

	rr := httptest.NewRecorder()
	GetSharedContentEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestGetSharedContentEndpoint_MissingChapterParam(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()
	req := newSharedRequest("/shared/content", mockDAO, link)

	rr := httptest.NewRecorder()
	GetSharedContentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestGetSharedContentEndpoint_ChapterScopeEnforcement(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()
	link.ChapterID = "ch1" // scoped to ch1

	// Try to access ch2 -- should be forbidden
	req := newSharedRequest("/shared/content?chapter=ch2", mockDAO, link)

	rr := httptest.NewRecorder()
	GetSharedContentEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ============================================================
// CreateCommentEndpoint tests (public/reader-side)
// ============================================================

func TestCreateCommentEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateComment = func(_ models.Comment) error {
		return nil
	}

	link := defaultShareLink()

	body, _ := json.Marshal(models.CreateCommentRequest{
		ChapterID:  "ch1",
		BlockKeyID: "block-key-1",
		Body:       "This is a great paragraph!",
	})

	req := httptest.NewRequest(http.MethodPost, "/shared/comments", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	CreateCommentEndpoint(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var comment models.Comment
	if err := json.Unmarshal(rr.Body.Bytes(), &comment); err != nil {
		t.Errorf("Failed to unmarshal response: %v", err)
	}
	if comment.CommentID == "" {
		t.Error("Expected non-empty comment_id")
	}
	if comment.Body != "This is a great paragraph!" {
		t.Errorf("Expected body 'This is a great paragraph!', got '%s'", comment.Body)
	}
	if comment.ReaderEmail != "reader@test.com" {
		t.Errorf("Expected reader_email 'reader@test.com', got '%s'", comment.ReaderEmail)
	}
	if comment.StoryID != "story123" {
		t.Errorf("Expected story_id 'story123', got '%s'", comment.StoryID)
	}
}

func TestCreateCommentEndpoint_CommentsDisabled(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()
	link.CommentsEnabled = false

	body, _ := json.Marshal(models.CreateCommentRequest{
		ChapterID:  "ch1",
		BlockKeyID: "block-key-1",
		Body:       "A comment",
	})

	req := httptest.NewRequest(http.MethodPost, "/shared/comments", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	CreateCommentEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateCommentEndpoint_EmptyBody(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()

	body, _ := json.Marshal(models.CreateCommentRequest{
		ChapterID:  "ch1",
		BlockKeyID: "block-key-1",
		Body:       "",
	})

	req := httptest.NewRequest(http.MethodPost, "/shared/comments", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	CreateCommentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateCommentEndpoint_BodyTooLong(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()

	longBody := strings.Repeat("a", 2001)
	body, _ := json.Marshal(models.CreateCommentRequest{
		ChapterID:  "ch1",
		BlockKeyID: "block-key-1",
		Body:       longBody,
	})

	req := httptest.NewRequest(http.MethodPost, "/shared/comments", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	CreateCommentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateCommentEndpoint_MissingBlockKeyID(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	link := defaultShareLink()

	body, _ := json.Marshal(models.CreateCommentRequest{
		ChapterID: "ch1",
		Body:      "A valid comment body",
	})

	req := httptest.NewRequest(http.MethodPost, "/shared/comments", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	CreateCommentEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
