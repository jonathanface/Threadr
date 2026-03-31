package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

func TestAdminDeleteUser_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}
	mockDAO.MockDeleteUser = func(email string) error {
		if email != "target@example.com" {
			t.Errorf("Expected target@example.com, got %s", email)
		}
		return nil
	}

	req := createTestRequestWithSession("DELETE", "/admin/users/target@example.com", nil)
	req = mux.SetURLVars(req, map[string]string{"email": "target@example.com"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["message"] != "User deleted" {
		t.Errorf("Expected 'User deleted', got '%s'", response["message"])
	}
}

func TestAdminDeleteUser_NotAdmin(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: false}, nil
	}

	req := createTestRequestWithSession("DELETE", "/admin/users/target@example.com", nil)
	req = mux.SetURLVars(req, map[string]string{"email": "target@example.com"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "admin access required" {
		t.Errorf("Expected 'admin access required', got '%s'", response["error"])
	}
}

func TestAdminDeleteUser_MissingEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	req := createTestRequestWithSession("DELETE", "/admin/users/", nil)
	req = mux.SetURLVars(req, map[string]string{"email": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Missing email" {
		t.Errorf("Expected 'Missing email', got '%s'", response["error"])
	}
}

func TestAdminDeleteUser_SelfDeletePrevention(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	req := createTestRequestWithSession("DELETE", "/admin/users/test@example.com", nil)
	req = mux.SetURLVars(req, map[string]string{"email": "test@example.com"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "Cannot delete your own account from admin panel" {
		t.Errorf("Expected self-delete error, got '%s'", response["error"])
	}
}

func TestAdminDeleteUser_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}
	mockDAO.MockDeleteUser = func(email string) error {
		return daos.ErrMockDAO
	}

	req := createTestRequestWithSession("DELETE", "/admin/users/target@example.com", nil)
	req = mux.SetURLVars(req, map[string]string{"email": "target@example.com"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestAdminDeleteUser_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("DELETE", "/admin/users/target@example.com", nil)
	req = mux.SetURLVars(req, map[string]string{"email": "target@example.com"})
	// No DAO in context

	rr := httptest.NewRecorder()
	AdminDeleteUserEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]string
	json.Unmarshal(rr.Body.Bytes(), &response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO context error, got '%s'", response["error"])
	}
}
