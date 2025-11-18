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

func TestWriteAssocationsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockIsStoryInASeries = func(email, storyID string) (string, error) {
		return "", nil
	}
	mockDAO.MockGetStoryOrSeriesAssociationThumbnails = func(email, storyID string) ([]*models.SimplifiedAssociation, error) {
		return []*models.SimplifiedAssociation{}, nil
	}
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		if storyOrSeriesID != "story123" {
			t.Errorf("Expected storyOrSeriesID story123, got %s", storyOrSeriesID)
		}
		return nil
	}

	associations := []*models.Association{
		{ID: "assoc1", Name: "Character 1", Type: "character"},
		{ID: "", Name: "Character 2", Type: "character"}, // Should get UUID assigned
	}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response []*models.Association
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if len(response) != 2 {
		t.Errorf("Expected 2 associations, got %d", len(response))
	}
	// Check that empty ID was filled
	if response[1].ID == "" {
		t.Errorf("Expected second association to have ID assigned, got empty")
	}
}

func TestWriteAssocationsEndpoint_StoryInSeries(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockIsStoryInASeries = func(email, storyID string) (string, error) {
		return "series456", nil
	}
	mockDAO.MockGetStoryOrSeriesAssociationThumbnails = func(email, storyID string) ([]*models.SimplifiedAssociation, error) {
		return []*models.SimplifiedAssociation{}, nil
	}
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		if storyOrSeriesID != "series456" {
			t.Errorf("Expected storyOrSeriesID to be series456, got %s", storyOrSeriesID)
		}
		return nil
	}

	associations := []*models.Association{
		{ID: "assoc1", Name: "Character 1", Type: "character"},
	}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}
}

func TestWriteAssocationsEndpoint_NoSession(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteAssocationsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story//associations", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": ""})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected missing story ID error, got: %s", response["error"])
	}
}

func TestWriteAssocationsEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestWriteAssocationsEndpoint_NoDAO(t *testing.T) {
	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteAssocationsEndpoint_IsStoryInASeriesError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockIsStoryInASeries = func(email string, storyID string) (string, error) {
		return "", daos.ErrMockDAO
	}

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to check series membership of story" {
		t.Errorf("Expected series membership error, got: %s", response["error"])
	}
}

func TestWriteAssocationsEndpoint_WriteAssociationsError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		return daos.ErrMockDAO
	}

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestWriteAssocationsEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPut, "/api/story/story123/associations", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	WriteAssocationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}
