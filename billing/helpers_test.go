package billing

import (
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	gsessions "github.com/gorilla/sessions"
)

// Tests for atoiDefault
func TestAtoiDefault(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		defValue int
		expected int
	}{
		{
			name:     "empty string returns default",
			input:    "",
			defValue: 42,
			expected: 42,
		},
		{
			name:     "valid number string returns parsed value",
			input:    "100",
			defValue: 42,
			expected: 100,
		},
		{
			name:     "zero string returns zero",
			input:    "0",
			defValue: 42,
			expected: 0,
		},
		{
			name:     "negative number string",
			input:    "-5",
			defValue: 42,
			expected: -5,
		},
		{
			name:     "invalid string returns default",
			input:    "not-a-number",
			defValue: 99,
			expected: 99,
		},
		{
			name:     "string with spaces returns default",
			input:    " 123 ",
			defValue: 10,
			expected: 10,
		},
		{
			name:     "float string returns default",
			input:    "3.14",
			defValue: 20,
			expected: 20,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := atoiDefault(tt.input, tt.defValue)
			if result != tt.expected {
				t.Errorf("atoiDefault(%q, %d) = %d, want %d", tt.input, tt.defValue, result, tt.expected)
			}
		})
	}
}

// Tests for getenv
func TestGetenv(t *testing.T) {
	tests := []struct {
		name     string
		envKey   string
		envValue string
		defValue string
		expected string
		setup    func()
		cleanup  func()
	}{
		{
			name:     "env var not set returns default",
			envKey:   "TEST_UNSET_VAR",
			defValue: "default-value",
			expected: "default-value",
			setup: func() {
				os.Unsetenv("TEST_UNSET_VAR")
			},
			cleanup: func() {},
		},
		{
			name:     "env var set returns env value",
			envKey:   "TEST_SET_VAR",
			envValue: "env-value",
			defValue: "default-value",
			expected: "env-value",
			setup: func() {
				os.Setenv("TEST_SET_VAR", "env-value")
			},
			cleanup: func() {
				os.Unsetenv("TEST_SET_VAR")
			},
		},
		{
			name:     "empty env var returns default",
			envKey:   "TEST_EMPTY_VAR",
			envValue: "",
			defValue: "default-value",
			expected: "default-value",
			setup: func() {
				os.Setenv("TEST_EMPTY_VAR", "")
			},
			cleanup: func() {
				os.Unsetenv("TEST_EMPTY_VAR")
			},
		},
		{
			name:     "env var with spaces is preserved",
			envKey:   "TEST_SPACES_VAR",
			envValue: "  value with spaces  ",
			defValue: "default",
			expected: "  value with spaces  ",
			setup: func() {
				os.Setenv("TEST_SPACES_VAR", "  value with spaces  ")
			},
			cleanup: func() {
				os.Unsetenv("TEST_SPACES_VAR")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setup != nil {
				tt.setup()
			}
			defer func() {
				if tt.cleanup != nil {
					tt.cleanup()
				}
			}()

			result := getenv(tt.envKey, tt.defValue)
			if result != tt.expected {
				t.Errorf("getenv(%q, %q) = %q, want %q", tt.envKey, tt.defValue, result, tt.expected)
			}
		})
	}
}

// Setup session for getUserEmail tests
func setupSessionForTest() {
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "test-secret-key-for-testing-purposes-only")
	}
	sessions.Store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))
}

// Tests for getUserEmail
func TestGetUserEmail(t *testing.T) {
	setupSessionForTest()

	tests := []struct {
		name        string
		setupReq    func() *http.Request
		expectEmail string
		expectError bool
	}{
		{
			name: "successful email extraction from session",
			setupReq: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				w := httptest.NewRecorder()

				session, _ := sessions.Store.Get(req, "token")
				session.IsNew = false

				userInfo := models.UserInfo{Email: "test@example.com"}
				tokenData, _ := json.Marshal(userInfo)
				session.Values["token_data"] = tokenData
				session.Save(req, w)

				// Copy cookies from response to request
				for _, cookie := range w.Result().Cookies() {
					req.AddCookie(cookie)
				}

				return req
			},
			expectEmail: "test@example.com",
			expectError: false,
		},
		{
			name: "no session returns error",
			setupReq: func() *http.Request {
				return httptest.NewRequest("GET", "/test", nil)
			},
			expectEmail: "",
			expectError: true,
		},
		{
			name: "new session returns error",
			setupReq: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				w := httptest.NewRecorder()

				session, _ := sessions.Store.Get(req, "token")
				session.IsNew = true // explicitly mark as new
				session.Save(req, w)

				for _, cookie := range w.Result().Cookies() {
					req.AddCookie(cookie)
				}

				return req
			},
			expectEmail: "",
			expectError: true,
		},
		{
			name: "session with invalid token data returns error",
			setupReq: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				w := httptest.NewRecorder()

				session, _ := sessions.Store.Get(req, "token")
				session.IsNew = false
				session.Values["token_data"] = []byte("invalid json data")
				session.Save(req, w)

				for _, cookie := range w.Result().Cookies() {
					req.AddCookie(cookie)
				}

				return req
			},
			expectEmail: "",
			expectError: true,
		},
		{
			name: "session with different email",
			setupReq: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				w := httptest.NewRecorder()

				session, _ := sessions.Store.Get(req, "token")
				session.IsNew = false

				userInfo := models.UserInfo{Email: "another@example.com"}
				tokenData, _ := json.Marshal(userInfo)
				session.Values["token_data"] = tokenData
				session.Save(req, w)

				for _, cookie := range w.Result().Cookies() {
					req.AddCookie(cookie)
				}

				return req
			},
			expectEmail: "another@example.com",
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.setupReq()
			email, err := getUserEmail(req)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}

			if email != tt.expectEmail {
				t.Errorf("got email %q, want %q", email, tt.expectEmail)
			}
		})
	}
}

// Test ensureCustomer panic on nil user
func TestEnsureCustomer_NilUserPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Errorf("expected panic for nil user, got none")
		}
	}()

	ensureCustomer(nil, &models.Subscription{})
}

// Test RespondWithJson with unmarshalable data
func TestRespondWithJson_UnmarshalableData(t *testing.T) {
	w := httptest.NewRecorder()

	// Channels cannot be marshaled to JSON
	invalidPayload := make(chan int)

	RespondWithJson(w, 200, invalidPayload)

	if w.Code != 500 {
		t.Errorf("expected status 500 for marshal error, got %d", w.Code)
	}

	// Check that error message is in response
	body := w.Body.String()
	if body == "" {
		t.Error("expected error message in body")
	}
}
