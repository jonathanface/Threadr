package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
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

func TestDeleteAssociationsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteAssociations = func(email, storyID string, associations []*models.Association) error {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if len(associations) != 2 {
			t.Errorf("Expected 2 associations, got %d", len(associations))
		}
		return nil
	}

	associations := []*models.Association{
		{ID: "assoc1"},
		{ID: "assoc2"},
	}
	body, _ := json.Marshal(associations)

	req := createTestRequestWithSession("DELETE", "/story/story123/associations", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteAssociationsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story//associations", nil)
	req = mux.SetURLVars(req, map[string]string{"story": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story ID" {
		t.Errorf("Expected 'Missing story ID' error, got '%s'", response["error"])
	}
}

func TestDeleteAssociationsEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story/story123/associations", bytes.NewBuffer([]byte("invalid json")))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestDeleteAssociationsEndpoint_NoDAO(t *testing.T) {
	associations := []*models.Association{
		{ID: "assoc1"},
	}
	body, _ := json.Marshal(associations)

	req := createTestRequestWithSession("DELETE", "/story/story123/associations", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	// No DAO in context

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestDeleteAssociationsEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteAssociations = func(email, storyID string, associations []*models.Association) error {
		return daos.ErrMockDAO
	}

	associations := []*models.Association{
		{ID: "assoc1"},
	}
	body, _ := json.Marshal(associations)

	req := createTestRequestWithSession("DELETE", "/story/story123/associations", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestDeleteAssociationsEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteAssociations = func(email, storyID string, associations []*models.Association) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "DeleteItem",
			Err:           daos.ErrMockDAO,
		}
	}

	associations := []*models.Association{
		{ID: "assoc1"},
	}
	body, _ := json.Marshal(associations)

	req := createTestRequestWithSession("DELETE", "/story/story123/associations", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteAssociationsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
