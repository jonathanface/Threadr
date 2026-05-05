package auth

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
	"time"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"golang.org/x/crypto/bcrypt"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func makeCtxWithDAO(req *http.Request, dao daos.DaoInterface) *http.Request {
	return req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, dao))
}

func jsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to marshal JSON body: %v", err)
	}
	return bytes.NewBuffer(b)
}

func decodeJSON(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&m); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	return m
}

func testOptions() OauthOptions {
	return OauthOptions{FrontEndURL: "http://localhost:8080"}
}

// testHash is a bcrypt hash of "password123" using MinCost for speed.
var testHash string

func init() {
	h, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	if err != nil {
		panic(err)
	}
	testHash = string(h)
}

// ---------------------------------------------------------------------------
// EmailSignupHandler
// ---------------------------------------------------------------------------

func TestEmailSignup_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}
	mockDAO.MockCreateEmailUser = func(email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, FirstName: firstName, LastName: lastName, AuthType: "email"}, nil
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailSignup_MissingEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailSignup_InvalidEmailFormat(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "not-an-email",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["error"] != "Invalid email address" {
		t.Errorf("Unexpected error message: %v", resp["error"])
	}
}

func TestEmailSignup_MissingNames(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "",
		LastName:  "",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["error"] != "First and last name are required" {
		t.Errorf("Unexpected error message: %v", resp["error"])
	}
}

func TestEmailSignup_PasswordTooShort(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "short",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "at least") {
		t.Errorf("Expected password-length error, got: %v", resp["error"])
	}
}

func TestEmailSignup_PasswordTooLong(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	longPassword := strings.Repeat("a", 73) // exceeds bcrypt limit of 72
	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  longPassword,
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "or less") {
		t.Errorf("Expected password-length error, got: %v", resp["error"])
	}
}

func TestEmailSignup_ExistingOAuthAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "google"}, nil
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["auth_type"] != "google" {
		t.Errorf("Expected auth_type=google, got: %v", resp["auth_type"])
	}
}

func TestEmailSignup_ExistingEmailAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "email"}, nil
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["error"] != "account_exists" {
		t.Errorf("Expected 'account_exists' error, got: %v", resp["error"])
	}
}

func TestEmailSignup_DAOErrorOnGetUserDetails(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, errors.New("database connection failed")
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ---------------------------------------------------------------------------
// EmailLoginHandler
// ---------------------------------------------------------------------------

func TestEmailLogin_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:         email,
			FirstName:     "Test",
			LastName:      "User",
			AuthType:      "email",
			EmailVerified: true,
			PasswordHash:  testHash,
		}, nil
	}
	mockDAO.MockUpsertUser = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "test@example.com",
		Password: "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	resp := decodeJSON(t, rr)
	if resp["email"] != "test@example.com" {
		t.Errorf("Expected email in response, got: %v", resp["email"])
	}
	if resp["first_name"] != "Test" {
		t.Errorf("Expected first_name=Test, got: %v", resp["first_name"])
	}
}

func TestEmailLogin_MissingEmailPassword(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "",
		Password: "",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailLogin_UserNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "nobody@example.com",
		Password: "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailLogin_OAuthAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "google"}, nil
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "test@example.com",
		Password: "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["auth_type"] != "google" {
		t.Errorf("Expected auth_type=google, got: %v", resp["auth_type"])
	}
}

func TestEmailLogin_EmailNotVerified(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:         email,
			AuthType:      "email",
			EmailVerified: false,
			PasswordHash:  testHash,
		}, nil
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "test@example.com",
		Password: "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["error"] != "email_not_verified" {
		t.Errorf("Expected error=email_not_verified, got: %v", resp["error"])
	}
}

func TestEmailLogin_WrongPassword(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:         email,
			AuthType:      "email",
			EmailVerified: true,
			PasswordHash:  testHash,
		}, nil
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "test@example.com",
		Password: "wrongpassword",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ---------------------------------------------------------------------------
// EmailVerifyHandler
// ---------------------------------------------------------------------------

func TestEmailVerify_MissingToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodGet, "/auth/email/verify", nil)
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailVerifyHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailVerify_TokenNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByVerificationToken = func(token string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/email/verify?token=badtoken", nil)
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailVerifyHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestEmailVerify_TokenExpired(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByVerificationToken = func(token string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:                    "test@example.com",
			VerificationTokenExpires: time.Now().Add(-1 * time.Hour).Unix(), // expired 1 hour ago
		}, nil
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/email/verify?token=expiredtoken", nil)
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailVerifyHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "expired") {
		t.Errorf("Expected expiration error, got: %v", resp["error"])
	}
}

func TestEmailVerify_Success(t *testing.T) {
	verifiedEmail := ""
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByVerificationToken = func(token string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:                    "test@example.com",
			VerificationTokenExpires: time.Now().Add(1 * time.Hour).Unix(), // still valid
		}, nil
	}
	mockDAO.MockSetEmailVerified = func(email string) error {
		verifiedEmail = email
		return nil
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/email/verify?token=goodtoken", nil)
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailVerifyHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusFound {
		t.Errorf("Expected 302 redirect, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	loc := rr.Header().Get("Location")
	expected := "http://localhost:8080/signin?verified=true"
	if loc != expected {
		t.Errorf("Expected redirect to %s, got: %s", expected, loc)
	}
	if verifiedEmail != "test@example.com" {
		t.Errorf("Expected SetEmailVerified called with test@example.com, got: %s", verifiedEmail)
	}
}

// ---------------------------------------------------------------------------
// PasswordResetRequestHandler
// ---------------------------------------------------------------------------

func TestPasswordResetRequest_AlwaysReturns200(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows // user doesn't exist
	}

	body := jsonBody(t, models.PasswordResetRequest{Email: "nobody@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset-request", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetRequestHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestPasswordResetRequest_SetsTokenForValidUser(t *testing.T) {
	resetTokenSet := false
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "email", EmailVerified: true}, nil
	}
	mockDAO.MockSetResetToken = func(email, token string, expires int64) error {
		resetTokenSet = true
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got: %s", email)
		}
		if token == "" {
			t.Error("Expected non-empty reset token")
		}
		if expires <= time.Now().Unix() {
			t.Error("Expected token expiry to be in the future")
		}
		return nil
	}

	body := jsonBody(t, models.PasswordResetRequest{Email: "test@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset-request", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetRequestHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	if !resetTokenSet {
		t.Error("Expected SetResetToken to be called")
	}
}

func TestPasswordResetRequest_EmptyEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.PasswordResetRequest{Email: ""})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset-request", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetRequestHandler(testOptions()).ServeHTTP(rr, req)

	// Still returns 200 to prevent enumeration
	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ---------------------------------------------------------------------------
// PasswordResetHandler
// ---------------------------------------------------------------------------

func TestPasswordReset_MissingToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "",
		NewPassword: "newpassword123",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestPasswordReset_PasswordTooShort(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "validtoken",
		NewPassword: "short",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "at least") {
		t.Errorf("Expected min-length error, got: %v", resp["error"])
	}
}

func TestPasswordReset_TokenNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByResetToken = func(token string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "badtoken",
		NewPassword: "newpassword123",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestPasswordReset_TokenExpired(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByResetToken = func(token string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:             "test@example.com",
			ResetTokenExpires: time.Now().Add(-1 * time.Hour).Unix(),
		}, nil
	}

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "expiredtoken",
		NewPassword: "newpassword123",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "expired") {
		t.Errorf("Expected expiration error, got: %v", resp["error"])
	}
}

func TestPasswordReset_Success(t *testing.T) {
	passwordUpdated := false
	mockDAO := daos.NewMockDAO()
	mockDAO.MockFindUserByResetToken = func(token string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:             "test@example.com",
			ResetTokenExpires: time.Now().Add(1 * time.Hour).Unix(),
		}, nil
	}
	mockDAO.MockUpdatePassword = func(email, passwordHash string) error {
		passwordUpdated = true
		if email != "test@example.com" {
			t.Errorf("Expected email test@example.com, got: %s", email)
		}
		// Verify the hash is valid bcrypt
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte("newpassword123")); err != nil {
			t.Errorf("Password hash does not match new password: %v", err)
		}
		return nil
	}

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "goodtoken",
		NewPassword: "newpassword123",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	if !passwordUpdated {
		t.Error("Expected UpdatePassword to be called")
	}
}

func TestPasswordReset_PasswordTooLong(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, models.PasswordResetConfirm{
		Token:       "validtoken",
		NewPassword: strings.Repeat("x", 73),
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "or less") {
		t.Errorf("Expected max-length error, got: %v", resp["error"])
	}
}

// ---------------------------------------------------------------------------
// LinkOAuthAccountHandler
// ---------------------------------------------------------------------------

func TestLinkOAuthAccount_MissingFields(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	body := jsonBody(t, map[string]string{
		"email":    "test@example.com",
		"password": "",
		"provider": "",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/link-oauth", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	LinkOAuthAccountHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestLinkOAuthAccount_WrongPassword(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:        email,
			AuthType:     "email",
			PasswordHash: testHash,
		}, nil
	}

	body := jsonBody(t, map[string]string{
		"email":    "test@example.com",
		"password": "wrongpassword",
		"provider": "google",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/link-oauth", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	LinkOAuthAccountHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestLinkOAuthAccount_Success(t *testing.T) {
	linkedProvider := ""
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:        email,
			AuthType:     "email",
			PasswordHash: testHash,
		}, nil
	}
	mockDAO.MockLinkOAuthAccount = func(email, authType string) error {
		linkedProvider = authType
		return nil
	}

	body := jsonBody(t, map[string]string{
		"email":    "test@example.com",
		"password": "password123",
		"provider": "google",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/link-oauth", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	LinkOAuthAccountHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	if linkedProvider != "google" {
		t.Errorf("Expected provider=google, got: %s", linkedProvider)
	}
	resp := decodeJSON(t, rr)
	if resp["provider"] != "google" {
		t.Errorf("Expected provider=google in response, got: %v", resp["provider"])
	}
}

func TestLinkOAuthAccount_UserNotFound(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}

	body := jsonBody(t, map[string]string{
		"email":    "nobody@example.com",
		"password": "password123",
		"provider": "google",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/link-oauth", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	LinkOAuthAccountHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

func TestLinkOAuthAccount_NotEmailAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:    email,
			AuthType: "google",
		}, nil
	}

	body := jsonBody(t, map[string]string{
		"email":    "test@example.com",
		"password": "password123",
		"provider": "amazon",
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/link-oauth", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	LinkOAuthAccountHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if !strings.Contains(resp["error"].(string), "not an email account") {
		t.Errorf("Expected 'not an email account' error, got: %v", resp["error"])
	}
}

// ---------------------------------------------------------------------------
// Edge case: Amazon OAuth account conflict in signup
// ---------------------------------------------------------------------------

func TestEmailSignup_ExistingAmazonOAuthAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "amazon"}, nil
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["auth_type"] != "amazon" {
		t.Errorf("Expected auth_type=amazon, got: %v", resp["auth_type"])
	}
}

// ---------------------------------------------------------------------------
// Edge case: Amazon OAuth account in login
// ---------------------------------------------------------------------------

func TestEmailLogin_AmazonOAuthAccount(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "amazon"}, nil
	}

	body := jsonBody(t, models.EmailLoginRequest{
		Email:    "test@example.com",
		Password: "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/login", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailLoginHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("Expected 409, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	resp := decodeJSON(t, rr)
	if resp["auth_type"] != "amazon" {
		t.Errorf("Expected auth_type=amazon, got: %v", resp["auth_type"])
	}
}

// ---------------------------------------------------------------------------
// Edge case: CreateEmailUser DAO error
// ---------------------------------------------------------------------------

func TestEmailSignup_CreateUserDAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}
	mockDAO.MockCreateEmailUser = func(email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error) {
		return nil, errors.New("dynamodb write failed")
	}

	body := jsonBody(t, models.EmailSignupRequest{
		Email:     "test@example.com",
		Password:  "password123",
		FirstName: "Test",
		LastName:  "User",
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/email/signup", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	EmailSignupHandler(testOptions()).ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}

// ---------------------------------------------------------------------------
// PasswordResetRequest for OAuth user (should still return 200)
// ---------------------------------------------------------------------------

func TestPasswordResetRequest_OAuthUser(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, AuthType: "google"}, nil
	}

	body := jsonBody(t, models.PasswordResetRequest{Email: "oauth@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/auth/password/reset-request", body)
	req.Header.Set("Content-Type", "application/json")
	req = makeCtxWithDAO(req, mockDAO)

	rr := httptest.NewRecorder()
	PasswordResetRequestHandler(testOptions()).ServeHTTP(rr, req)

	// Should return 200 even for OAuth users (no enumeration)
	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
}
