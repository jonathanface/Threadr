package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestAssociationDetailsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAssociationDetails = func(email, storyID, associationID string) (*models.Association, error) {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if associationID != "assoc1" {
			t.Errorf("Expected associationID assoc1, got %s", associationID)
		}
		return &models.Association{
			ID:   associationID,
			Name: "Test Association",
		}, nil
	}

	req := createTestRequestWithSession("GET", "/story/story123/association/assoc1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "associationID": "assoc1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
		return
	}

	var association models.Association
	err := json.NewDecoder(rr.Body).Decode(&association)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if association.ID != "assoc1" {
		t.Errorf("Expected association ID assoc1, got %s", association.ID)
	}
	if association.Name != "Test Association" {
		t.Errorf("Expected name 'Test Association', got %s", association.Name)
	}
}

func TestAssociationDetailsEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story//association/assoc1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "", "associationID": "assoc1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story id" {
		t.Errorf("Expected 'Missing story id' error, got '%s'", response["error"])
	}
}

func TestAssociationDetailsEndpoint_MissingAssociationID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("GET", "/story/story123/association/", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "associationID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing association id" {
		t.Errorf("Expected 'Missing association id' error, got '%s'", response["error"])
	}
}

func TestAssociationDetailsEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("GET", "/story/story123/association/assoc1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "associationID": "assoc1"})
	// No DAO in context

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestAssociationDetailsEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAssociationDetails = func(email, storyID, associationID string) (*models.Association, error) {
		return nil, errors.New("database error")
	}

	req := createTestRequestWithSession("GET", "/story/story123/association/assoc1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "associationID": "assoc1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestAssociationDetailsEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAssociationDetails = func(email, storyID, associationID string) (*models.Association, error) {
		return nil, &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "GetItem",
			Err:           daos.ErrMockDAO,
		}
	}

	req := createTestRequestWithSession("GET", "/story/story123/association/assoc1", nil)
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123", "associationID": "assoc1"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AssociationDetailsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
