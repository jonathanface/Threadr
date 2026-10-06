package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
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

func boolPtr(b bool) *bool { return &b }

// baseDraftRequest returns a request wired with a mocked DAO, a session
// cookie for test@example.com, and the Subscriber context key set to true
// by default. Tests exercising the subscriber gate override with the
// `subscriber` parameter.
func baseDraftRequest(method, url string, mockDAO *daos.MockDAO, body any, subscriber bool) *http.Request {
	var buf *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewBuffer(b)
	} else {
		buf = &bytes.Buffer{}
	}
	req := httptest.NewRequest(method, url, buf)
	req = AddSessionCookieToRequest(req, "test@example.com")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.Subscriber, subscriber)
	return req.WithContext(ctx)
}

func TestCreateStoryDraftEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateStoryDraft = func(email, src, name string) (*models.Story, error) {
		if email != "test@example.com" || src != "src-1" || name != "Alternate" {
			t.Errorf("unexpected args: email=%q src=%q name=%q", email, src, name)
		}
		return &models.Story{ID: "new-1", OriginalStoryID: "src-1", DraftName: "Alternate"}, nil
	}

	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/src-1/drafts",
		mockDAO, draftCreateRequest{DraftName: "Alternate"}, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})

	w := httptest.NewRecorder()
	CreateStoryDraftEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body=%s", w.Code, w.Body.String())
	}
	var story models.Story
	if err := json.NewDecoder(w.Body).Decode(&story); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if story.ID != "new-1" || story.OriginalStoryID != "src-1" || story.DraftName != "Alternate" {
		t.Errorf("unexpected story in response: %+v", story)
	}
}

func TestCreateStoryDraftEndpoint_NonSubscriberGets402(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/src-1/drafts",
		mockDAO, draftCreateRequest{DraftName: "Alternate"}, false)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})
	w := httptest.NewRecorder()
	CreateStoryDraftEndpoint(w, req)
	if w.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestCreateStoryDraftEndpoint_MissingNameReturns400(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/src-1/drafts",
		mockDAO, draftCreateRequest{DraftName: "   "}, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})
	w := httptest.NewRecorder()
	CreateStoryDraftEndpoint(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestCreateStoryDraftEndpoint_DAOErrorReturns500(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateStoryDraft = func(_, _, _ string) (*models.Story, error) {
		return nil, errors.New("boom")
	}
	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/src-1/drafts",
		mockDAO, draftCreateRequest{DraftName: "A"}, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})
	w := httptest.NewRecorder()
	CreateStoryDraftEndpoint(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestListStoryDraftsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockListDrafts = func(_, storyID string) ([]*models.Story, error) {
		if storyID != "src-1" {
			t.Errorf("unexpected storyID: %q", storyID)
		}
		return []*models.Story{
			{ID: "root-1", DraftName: "Original", IsCurrentDraft: boolPtr(true)},
			{ID: "draft-a", OriginalStoryID: "root-1", DraftName: "Alt"},
		}, nil
	}
	req := baseDraftRequest(http.MethodGet, "/api/v1/stories/src-1/drafts", mockDAO, nil, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})
	w := httptest.NewRecorder()
	ListStoryDraftsEndpoint(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body=%s", w.Code, w.Body.String())
	}
	var got []models.Story
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 || got[0].ID != "root-1" || got[1].ID != "draft-a" {
		t.Errorf("unexpected drafts list: %+v", got)
	}
}

func TestListStoryDraftsEndpoint_NonSubscriberGets402(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	req := baseDraftRequest(http.MethodGet, "/api/v1/stories/src-1/drafts", mockDAO, nil, false)
	req = mux.SetURLVars(req, map[string]string{"storyID": "src-1"})
	w := httptest.NewRecorder()
	ListStoryDraftsEndpoint(w, req)
	if w.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestSetCurrentDraftEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	setCalled := false
	mockDAO.MockSetCurrentDraft = func(email, targetID string) error {
		setCalled = true
		if email != "test@example.com" || targetID != "draft-a" {
			t.Errorf("unexpected args: email=%q target=%q", email, targetID)
		}
		return nil
	}
	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/draft-a/drafts/current", mockDAO, nil, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "draft-a"})
	w := httptest.NewRecorder()
	SetCurrentDraftEndpoint(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body=%s", w.Code, w.Body.String())
	}
	if !setCalled {
		t.Error("SetCurrentDraft was never called")
	}
}

func TestSetCurrentDraftEndpoint_UnownedReturns404(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
		return nil, errors.New("no story found")
	}
	req := baseDraftRequest(http.MethodPost, "/api/v1/stories/draft-a/drafts/current", mockDAO, nil, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "draft-a"})
	w := httptest.NewRecorder()
	SetCurrentDraftEndpoint(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestRenameStoryDraftEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID}, nil
	}
	renameCalled := false
	mockDAO.MockRenameDraft = func(email, storyID, name string) error {
		renameCalled = true
		if email != "test@example.com" || storyID != "draft-a" || name != "New Name" {
			t.Errorf("unexpected args: email=%q storyID=%q name=%q", email, storyID, name)
		}
		return nil
	}
	req := baseDraftRequest(http.MethodPut, "/api/v1/stories/draft-a/draft-name",
		mockDAO, draftRenameRequest{DraftName: "  New Name  "}, true)
	req = mux.SetURLVars(req, map[string]string{"storyID": "draft-a"})
	w := httptest.NewRecorder()
	RenameStoryDraftEndpoint(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body=%s", w.Code, w.Body.String())
	}
	if !renameCalled {
		t.Error("RenameDraft was never called")
	}
}

func TestRenameStoryDraftEndpoint_NonSubscriberGets402(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	req := baseDraftRequest(http.MethodPut, "/api/v1/stories/draft-a/draft-name",
		mockDAO, draftRenameRequest{DraftName: "x"}, false)
	req = mux.SetURLVars(req, map[string]string{"storyID": "draft-a"})
	w := httptest.NewRecorder()
	RenameStoryDraftEndpoint(w, req)
	if w.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d. body=%s", w.Code, w.Body.String())
	}
}

// buildUploadRequest wires a multipart body with optional file + form
// fields. The file arg is a tuple so individual tests can omit the file
// to exercise the "no file provided" branch.
func buildUploadRequest(
	t *testing.T,
	mockDAO *daos.MockDAO,
	subscriber bool,
	storyID string,
	file *struct{ name, body string },
	fields map[string]string,
) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if file != nil {
		fw, err := w.CreateFormFile("file", file.name)
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		if _, err = fw.Write([]byte(file.body)); err != nil {
			t.Fatalf("write form file: %v", err)
		}
	}
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatalf("write field %s: %v", k, err)
		}
	}
	_ = w.Close()
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/stories/"+storyID+"/drafts/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req = AddSessionCookieToRequest(req, "test@example.com")
	ctx := context.WithValue(req.Context(), ctxkey.DAO, mockDAO)
	ctx = context.WithValue(ctx, ctxkey.Subscriber, subscriber)
	req = req.WithContext(ctx)
	return mux.SetURLVars(req, map[string]string{"storyID": storyID})
}

func TestCreateDraftFromImportEndpoint_NonSubscriberGets402(t *testing.T) {
	req := buildUploadRequest(t, daos.NewMockDAO(), false, "src-1",
		&struct{ name, body string }{"foo.txt", "hello"},
		map[string]string{"draft_name": "Alt"})
	w := httptest.NewRecorder()
	CreateDraftFromImportEndpoint(w, req)
	if w.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestCreateDraftFromImportEndpoint_MissingDraftNameReturns400(t *testing.T) {
	req := buildUploadRequest(t, daos.NewMockDAO(), true, "src-1",
		&struct{ name, body string }{"foo.txt", "hello"},
		map[string]string{"draft_name": "   "})
	w := httptest.NewRecorder()
	CreateDraftFromImportEndpoint(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestCreateDraftFromImportEndpoint_MissingFileReturns400(t *testing.T) {
	req := buildUploadRequest(t, daos.NewMockDAO(), true, "src-1", nil,
		map[string]string{"draft_name": "Alt"})
	w := httptest.NewRecorder()
	CreateDraftFromImportEndpoint(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d. body=%s", w.Code, w.Body.String())
	}
}

func TestCreateDraftFromImportEndpoint_UnsupportedFormatReturns400(t *testing.T) {
	// A .pdf extension isn't in the allowed set — endpoint should reject
	// before touching the DAO or shelling out to pandoc.
	daoCalled := false
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateStoryDraft = func(_, _, _ string) (*models.Story, error) {
		daoCalled = true
		return nil, errors.New("should not be called")
	}
	req := buildUploadRequest(t, mockDAO, true, "src-1",
		&struct{ name, body string }{"foo.pdf", "pdf bytes"},
		map[string]string{"draft_name": "Alt"})
	w := httptest.NewRecorder()
	CreateDraftFromImportEndpoint(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d. body=%s", w.Code, w.Body.String())
	}
	if daoCalled {
		t.Error("DAO must not be called for unsupported formats")
	}
}
