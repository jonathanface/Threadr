package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/smithy-go"
)

func init() {
	// Initialize test session
	SetupTestSession()
}

func TestUpdateUserEndpoint_Success(t *testing.T) {
	// Create a mock DAO
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:     "test@example.com",
			FirstName: "Test",
		}, nil
	}
	mockDAO.MockUpdateUser = func(user models.UserInfo) error {
		if user.Email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got %s", user.Email)
		}
		return nil
	}

	// Create request body
	userInfo := models.UserInfo{
		Email:     "test@example.com",
		FirstName: "UpdatedName",
	}
	body, _ := json.Marshal(userInfo)

	// Create HTTP request
	req := httptest.NewRequest(http.MethodPut, "/api/user", bytes.NewBuffer(body))

	// Add session data first
	req = AddSessionCookieToRequest(req, "test@example.com")

	// Then add DAO to context (order matters to preserve the session-created context)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	// Create response recorder
	w := httptest.NewRecorder()

	// Call the endpoint
	UpdateUserEndpoint(w, req)

	// Assert response
	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response models.UserInfo
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if response.Email != "test@example.com" {
		t.Errorf("Expected email test@example.com, got %s", response.Email)
	}
}

func TestUpdateUserEndpoint_NoDAO(t *testing.T) {
	// Create request without DAO in context
	req := httptest.NewRequest(http.MethodPut, "/api/user", nil)
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	// Call the endpoint
	UpdateUserEndpoint(w, req)

	// Assert error response
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" || response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected error about DAO, got: %s", response["error"])
	}
}

func TestUpdateUserEndpoint_NoSession(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Create request without session
	req := httptest.NewRequest(http.MethodPut, "/api/user", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	// Call the endpoint
	UpdateUserEndpoint(w, req)

	// Assert error response
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" {
		t.Errorf("Expected error about session, got empty error")
	}
}

func TestUpdateUserEndpoint_UserNotFound(t *testing.T) {
	// Create a mock DAO that returns error for GetUserDetails
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, daos.ErrMockDAO
	}

	userInfo := models.UserInfo{Email: "test@example.com"}
	body, _ := json.Marshal(userInfo)

	req := httptest.NewRequest(http.MethodPut, "/api/user", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	UpdateUserEndpoint(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status NotFound, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" {
		t.Errorf("Expected error about unable to locate user")
	}
}

func TestUpdateUserEndpoint_InvalidRequestBody(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Create invalid JSON
	req := httptest.NewRequest(http.MethodPut, "/api/user", bytes.NewBufferString("invalid json"))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	UpdateUserEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" {
		t.Errorf("Expected error about invalid JSON")
	}
}

func TestUpdateUserEndpoint_UpdateUserError(t *testing.T) {
	// Create a mock DAO that returns error for UpdateUser
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}
	mockDAO.MockUpdateUser = func(_ models.UserInfo) error {
		return daos.ErrMockDAO
	}

	userInfo := models.UserInfo{Email: "test@example.com"}
	body, _ := json.Marshal(userInfo)

	req := httptest.NewRequest(http.MethodPut, "/api/user", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	UpdateUserEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" {
		t.Errorf("Expected error message, got empty")
	}
}

func TestUpdateUserEndpoint_AWSError(t *testing.T) {
	// Create a mock DAO that returns AWS operation error
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}
	mockDAO.MockUpdateUser = func(_ models.UserInfo) error {
		// Simulate AWS smithy operation error
		return &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "UpdateItem",
			Err:           daos.ErrMockDAO,
		}
	}

	userInfo := models.UserInfo{Email: "test@example.com"}
	body, _ := json.Marshal(userInfo)

	req := httptest.NewRequest(http.MethodPut, "/api/user", bytes.NewBuffer(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	req = AddSessionCookieToRequest(req, "test@example.com")

	w := httptest.NewRecorder()

	UpdateUserEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode error response: %v", err)
		return
	}
	if response["error"] == "" {
		t.Errorf("Expected error message, got empty")
	}
}
