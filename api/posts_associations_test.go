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

func TestCreateAssociationsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryOrSeriesAssociationThumbnails = func(email, storyID string) ([]*models.SimplifiedAssociation, error) {
		// Return less than max to allow creation
		return []*models.SimplifiedAssociation{
			{ID: "existing1", Name: "Existing Character"},
		}, nil
	}
	mockDAO.MockIsStoryInASeries = func(email string, storyID string) (string, error) {
		return "", nil // Not in a series
	}
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		return nil
	}

	associations := []*models.Association{
		{ID: "assoc1", Name: "Character 1", Type: "character"},
		{ID: "", Name: "Character 2", Type: "character"}, // Should get UUID assigned
	}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

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

func TestCreateAssociationsEndpoint_NonSubscriberLimitReached(t *testing.T) {
	// Create max number of associations for non-subscriber
	existingAssocs := make([]*models.SimplifiedAssociation, NON_SUBSCRIBER_MAX_ASSOC)
	for i := 0; i < NON_SUBSCRIBER_MAX_ASSOC; i++ {
		existingAssocs[i] = &models.SimplifiedAssociation{
			ID:   string(rune('a' + i)),
			Name: "Character " + string(rune('A' + i)),
		}
	}

	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryOrSeriesAssociationThumbnails = func(email, storyID string) ([]*models.SimplifiedAssociation, error) {
		return existingAssocs, nil
	}

	associations := []*models.Association{
		{ID: "new1", Name: "New Character", Type: "character"},
	}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, false))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusPaymentRequired {
		t.Errorf("Expected status PaymentRequired, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "insufficient subscription" {
		t.Errorf("Expected insufficient subscription error, got: %s", response["error"])
	}
}

func TestCreateAssociationsEndpoint_SubscriberNoLimit(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockIsStoryInASeries = func(email string, storyID string) (string, error) {
		return "", nil
	}
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		return nil
	}

	associations := []*models.Association{
		{ID: "assoc1", Name: "Character 1", Type: "character"},
	}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_NoSession(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story//associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_NoDAO(t *testing.T) {
	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_NoSubscriberContext(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to parse or retrieve subscriber key from context" {
		t.Errorf("Expected subscriber context error, got: %s", response["error"])
	}
}

func TestCreateAssociationsEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_GetAssociationError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryOrSeriesAssociationThumbnails = func(email, storyID string) ([]*models.SimplifiedAssociation, error) {
		return nil, daos.ErrMockDAO
	}

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, false))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateAssociationsEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockIsStoryInASeries = func(email string, storyID string) (string, error) {
		return "", nil
	}
	mockDAO.MockWriteAssociations = func(email, storyOrSeriesID string, associations []*models.Association) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	associations := []*models.Association{{ID: "assoc1", Name: "Character 1"}}
	body, _ := json.Marshal(associations)

	req := httptest.NewRequest(http.MethodPost, "/api/story/story123/associations", bytes.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	CreateAssociationsEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}
