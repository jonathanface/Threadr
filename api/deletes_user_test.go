package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/smithy-go"
)

func init() {
	SetupTestSession()
}

func TestDeleteUserEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteUser = func(email string) error {
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", email)
		}
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/user", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["message"] != "Account deleted successfully" {
		t.Errorf("Expected success message, got '%s'", response["message"])
	}
}

func TestDeleteUserEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("DELETE", "/user", nil)
	// No DAO in context

	rr := httptest.NewRecorder()
	DeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", response["error"])
	}
}

func TestDeleteUserEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteUser = func(email string) error {
		return daos.ErrMockDAO
	}

	req := createTestRequestWithSession("DELETE", "/user", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestDeleteUserEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockDeleteUser = func(email string) error {
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "UpdateItem",
			Err:           daos.ErrMockDAO,
		}
	}

	req := createTestRequestWithSession("DELETE", "/user", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteUserEndpoint_NoSession(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Create request without session
	req := httptest.NewRequest("DELETE", "/user", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	DeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	// Should fail due to missing session/email
	if response["error"] == "" {
		t.Errorf("Expected error for missing session, got empty error")
	}
}
