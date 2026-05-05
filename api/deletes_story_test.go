package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestDeleteStoryEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockSoftDeleteStory = func(email, storyID string, includeBlocks bool) error {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		if storyID != "story123" {
			t.Errorf("Expected storyID story123, got %s", storyID)
		}
		if includeBlocks != false {
			t.Errorf("Expected includeBlocks to be false, got %v", includeBlocks)
		}
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/story/story123", nil)
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteStoryEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteStoryEndpoint_MissingStoryID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("DELETE", "/story/", nil)
	req = mux.SetURLVars(req, map[string]string{"story": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteStoryEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing story title" {
		t.Errorf("Expected 'Missing story title' error, got '%s'", response["error"])
	}
}

func TestDeleteStoryEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("DELETE", "/story/story123", nil)
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	// No DAO in context

	rr := httptest.NewRecorder()
	DeleteStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestDeleteStoryEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockSoftDeleteStory = func(email, storyID string, includeBlocks bool) error {
		return daos.ErrMockDAO
	}

	req := createTestRequestWithSession("DELETE", "/story/story123", nil)
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestDeleteStoryEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockSoftDeleteStory = func(email, storyID string, includeBlocks bool) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "DeleteItem",
			Err:           daos.ErrMockDAO,
		}
	}

	req := createTestRequestWithSession("DELETE", "/story/story123", nil)
	req = mux.SetURLVars(req, map[string]string{"story": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteStoryEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
