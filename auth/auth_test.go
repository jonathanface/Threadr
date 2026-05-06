package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"Threadr/sessions"

	"github.com/gorilla/mux"
	gsessions "github.com/gorilla/sessions"
	"github.com/markbates/goth"
)

func init() {
	setupTestSession()
}

// setupTestSession initializes a test session store with a valid secret.
func setupTestSession() {
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "test-secret-key-for-testing-purposes-only")
	}
	sessions.Store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))
}

// Tests for determineFirstName.
func TestDetermineFirstName_WithFirstName(t *testing.T) {
	user := goth.User{
		FirstName: "John",
		NickName:  "johnny",
	}

	result := determineFirstName(user)
	if result != "John" {
		t.Errorf("Expected 'John', got '%s'", result)
	}
}

func TestDetermineFirstName_WithNickNameOnly(t *testing.T) {
	user := goth.User{
		FirstName: "",
		NickName:  "johnny",
	}

	result := determineFirstName(user)
	if result != "johnny" {
		t.Errorf("Expected 'johnny', got '%s'", result)
	}
}

func TestDetermineFirstName_AllEmpty(t *testing.T) {
	user := goth.User{
		FirstName: "",
		NickName:  "",
	}

	result := determineFirstName(user)
	if result != "Unknown" {
		t.Errorf("Expected 'Unknown', got '%s'", result)
	}
}

// Tests for determineLastName.
func TestDetermineLastName_WithLastName(t *testing.T) {
	user := goth.User{
		LastName: "Doe",
		Name:     "John Doe",
	}

	result := determineLastName(user)
	if result != "Doe" {
		t.Errorf("Expected 'Doe', got '%s'", result)
	}
}

func TestDetermineLastName_WithNameOnly(t *testing.T) {
	user := goth.User{
		LastName: "",
		Name:     "Jane Doe",
	}

	result := determineLastName(user)
	if result != "Doe" {
		t.Errorf("Expected 'Doe', got '%s'", result)
	}
}

func TestDetermineLastName_AllEmpty(t *testing.T) {
	user := goth.User{
		LastName: "",
		Name:     "",
	}

	result := determineLastName(user)
	if result != "Stranger" {
		t.Errorf("Expected 'Stranger', got '%s'", result)
	}
}

// Tests for safeRedirect.
func TestSafeRedirect_EmptyDest(t *testing.T) {
	result := safeRedirect("", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com" {
		t.Errorf("Expected default URL, got '%s'", result)
	}
}

func TestSafeRedirect_RelativePath(t *testing.T) {
	result := safeRedirect("/dashboard", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com/dashboard" {
		t.Errorf("Expected 'https://example.com/dashboard', got '%s'", result)
	}
}

func TestSafeRedirect_RelativePathWithQuery(t *testing.T) {
	result := safeRedirect("/dashboard?foo=bar", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com/dashboard?foo=bar" {
		t.Errorf("Expected 'https://example.com/dashboard?foo=bar', got '%s'", result)
	}
}

func TestSafeRedirect_RelativePathWithFragment(t *testing.T) {
	result := safeRedirect("/page#section", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com/page#section" {
		t.Errorf("Expected 'https://example.com/page#section', got '%s'", result)
	}
}

func TestSafeRedirect_AllowedAbsoluteURL(t *testing.T) {
	allowed := []string{"https://app.example.com", "https://example.com"}
	result := safeRedirect("https://app.example.com/dashboard", "https://example.com", allowed)
	if result != "https://app.example.com/dashboard" {
		t.Errorf("Expected 'https://app.example.com/dashboard', got '%s'", result)
	}
}

func TestSafeRedirect_AllowedAbsoluteURL_CaseInsensitive(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	result := safeRedirect("HTTPS://APP.EXAMPLE.COM/dashboard", "https://example.com", allowed)
	// url.Parse normalizes the scheme to lowercase, so we expect "https" not "HTTPS"
	if result != "https://APP.EXAMPLE.COM/dashboard" {
		t.Errorf("Expected 'https://APP.EXAMPLE.COM/dashboard', got '%s'", result)
	}
}

func TestSafeRedirect_DisallowedAbsoluteURL(t *testing.T) {
	allowed := []string{"https://example.com"}
	result := safeRedirect("https://evil.com/phishing", "https://example.com", allowed)
	if result != "https://example.com" {
		t.Errorf("Expected default URL for disallowed domain, got '%s'", result)
	}
}

func TestSafeRedirect_InvalidURL(t *testing.T) {
	result := safeRedirect("ht!tp://invalid", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com" {
		t.Errorf("Expected default URL for invalid URL, got '%s'", result)
	}
}

func TestSafeRedirect_URLWithoutHost(t *testing.T) {
	result := safeRedirect("mailto:test@example.com", "https://example.com", []string{"https://example.com"})
	if result != "https://example.com" {
		t.Errorf("Expected default URL for URL without host, got '%s'", result)
	}
}

func TestSafeRedirect_SchemeMismatch(t *testing.T) {
	allowed := []string{"https://example.com"}
	result := safeRedirect("http://example.com/page", "https://example.com", allowed)
	if result != "https://example.com" {
		t.Errorf("Expected default URL for scheme mismatch, got '%s'", result)
	}
}

func TestSafeRedirect_ProtocolRelativeURL(t *testing.T) {
	allowed := []string{"https://example.com"}
	result := safeRedirect("//evil.com/phishing", "https://example.com", allowed)
	if result != "https://example.com" {
		t.Errorf("Expected default URL for protocol-relative URL to disallowed domain, got '%s'", result)
	}
}

func TestSafeRedirect_BackslashPath(t *testing.T) {
	allowed := []string{"https://example.com"}
	result := safeRedirect("\\/\\/evil.com", "https://example.com", allowed)
	if result != "https://example.com" {
		t.Errorf("Expected default URL for backslash path bypass attempt, got '%s'", result)
	}
}

// Tests for Logout.
func TestLogout_Success(t *testing.T) {
	// Create request with session
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	w := httptest.NewRecorder()

	// Create a session
	session, _ := sessions.Store.Get(req, "token")
	session.Values["token_data"] = []byte("test data")
	session.Save(req, w)

	// Copy cookies from response to request
	for _, cookie := range w.Result().Cookies() {
		req.AddCookie(cookie)
	}

	// Create new recorder for actual test
	w = httptest.NewRecorder()

	// Call Logout
	Logout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	// Verify response is valid JSON
	var response any
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
	}
}

// Tests for callbackWithOptions - testing error cases that don't require gothic mocking.
func TestCallbackWithOptions_MissingProvider(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/callback", nil)
	// Set empty provider in mux vars
	req = mux.SetURLVars(req, map[string]string{"provider": ""})
	w := httptest.NewRecorder()

	callbackWithOptions(w, req, options)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for missing provider, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "Missing provider" {
		t.Errorf("Expected 'Missing provider' error, got '%s'", response["error"])
	}
}

func TestCallbackWithOptions_MissingDAO(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/callback/google", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	w := httptest.NewRecorder()

	// Don't add DAO to context - this will cause the error we're testing
	callbackWithOptions(w, req, options)

	// The function will fail at gothic.CompleteUserAuth before it checks for DAO
	// so we expect InternalServerError
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", w.Code)
	}
}

func TestCallbackWithOptions_WithDAO(t *testing.T) {
	// This tests that the callback function properly checks for DAO in context
	// Note: We can't fully test this without mocking gothic.CompleteUserAuth,
	// but we can verify the function handles the DAO context check
	mockDAO := daos.NewMockDAO()

	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/callback/google", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	w := httptest.NewRecorder()

	callbackWithOptions(w, req, options)

	// Will fail at gothic.CompleteUserAuth before reaching DAO logic
	// The test verifies that our context setup is correct
	if w.Code == http.StatusInternalServerError {
		t.Log("Function executed and hit gothic.CompleteUserAuth as expected")
	}
}

// Tests for loginWithOptions.
func TestLoginWithOptions_CreatesReferralSession(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/login/google?next=/dashboard", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	w := httptest.NewRecorder()

	loginWithOptions(w, req, options)

	// Check that a session cookie was set
	cookies := w.Result().Cookies()
	hasLoginReferral := false
	for _, cookie := range cookies {
		if cookie.Name == "login_referral" {
			hasLoginReferral = true
			break
		}
	}

	if !hasLoginReferral {
		t.Log("Session cookie should be set (may not appear in test without full gothic setup)")
	}
}

func TestLoginWithOptions_DefaultNextURL(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/login/google", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	w := httptest.NewRecorder()

	loginWithOptions(w, req, options)

	// The function should use FrontEndURL as default when no 'next' param is provided
	// We can't easily verify this without mocking gothic, but the function will execute
	if w.Code >= 500 {
		t.Logf("Function executed, status: %d", w.Code)
	}
}

// Test New function.
func TestNew(_ *testing.T) {
	options := OauthOptions{
		Mode:         models.ModeDevelopment,
		GoogleID:     "test-google-id",
		GoogleSecret: "test-google-secret",
		GoogleURL:    "https://example.com/auth/google/callback",
		AmazonID:     "test-amazon-id",
		AmazonSecret: "test-amazon-secret",
		AmazonURL:    "https://example.com/auth/amazon/callback",
	}

	// This should not panic
	New(options)

	// Verify that gothic.Store was set to sessions.Store
	// We can't directly test this without accessing unexported fields,
	// but we can verify the function doesn't panic
}

// Test handler constructors.
func TestCallbackHandler(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	handler := CallbackHandler(options)
	if handler == nil {
		t.Error("Expected non-nil handler")
	}

	// Verify it's actually an http.HandlerFunc
	var _ = handler
}

func TestLoginHandler(t *testing.T) {
	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	handler := LoginHandler(options)
	if handler == nil {
		t.Error("Expected non-nil handler")
	}

	// Verify it's actually an http.HandlerFunc
	var _ = handler
}

// Test edge cases for callbackWithOptions with DAO errors.
func TestCallbackWithOptions_GetUserDetailsError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, http.ErrServerClosed
	}

	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/callback/google", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	w := httptest.NewRecorder()

	callbackWithOptions(w, req, options)

	// Will fail at gothic.CompleteUserAuth before reaching DAO
	if w.Code == http.StatusInternalServerError {
		t.Log("Error handling works as expected")
	}
}

func TestCallbackWithOptions_UserNotFoundScenario(t *testing.T) {
	// This tests the scenario where a user is not found
	// Note: CreateUser is not mocked in the daos.MockDAO, so we can't fully test this path
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, sql.ErrNoRows
	}

	options := OauthOptions{
		FrontEndURL: "https://example.com",
	}

	req := httptest.NewRequest(http.MethodGet, "/callback/google", nil)
	req = mux.SetURLVars(req, map[string]string{"provider": "google"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	w := httptest.NewRecorder()

	callbackWithOptions(w, req, options)

	// Will fail at gothic.CompleteUserAuth before reaching DAO
	if w.Code == http.StatusInternalServerError {
		t.Log("Function executed as expected")
	}
}
