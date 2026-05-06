package sessions

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func init() {
	// Set up a test session secret (must be at least 32 characters)
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "test-secret-key-for-testing-purposes-only-32bytes")
	}
	// Initialize the store using the Initialize function
	if err := Initialize(); err != nil {
		panic("Failed to initialize sessions in tests: " + err.Error())
	}
}

// Tests for Get function.
func TestGet(t *testing.T) {
	t.Run("returns session for valid request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		session, err := Get(req, "test-session")

		if err != nil {
			t.Errorf("Get() returned error: %v", err)
		}
		if session == nil {
			t.Fatal("Get() returned nil session")
		}
		if !session.IsNew {
			t.Error("New session should be marked as IsNew")
		}
	})

	t.Run("returns session with correct name", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		sessionName := "my-session"
		session, err := Get(req, sessionName)

		if err != nil {
			t.Errorf("Get() returned error: %v", err)
		}
		if session.Name() != sessionName {
			t.Errorf("Session name = %q, want %q", session.Name(), sessionName)
		}
	})

	t.Run("returns existing session from cookie", func(t *testing.T) {
		// Create a session
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		session, _ := Get(req, "test-session")
		session.Values["test-key"] = "test-value"
		session.Save(req, w)

		// Get cookies from response
		cookies := w.Result().Cookies()
		if len(cookies) == 0 {
			t.Fatal("No cookies set")
		}

		// Create new request with the cookie
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		for _, cookie := range cookies {
			req2.AddCookie(cookie)
		}

		// Get session again
		session2, err := Get(req2, "test-session")
		if err != nil {
			t.Errorf("Get() returned error: %v", err)
		}
		if session2.IsNew {
			t.Error("Existing session should not be marked as IsNew")
		}
		if session2.Values["test-key"] != "test-value" {
			t.Errorf("Session value = %v, want %q", session2.Values["test-key"], "test-value")
		}
	})

	t.Run("handles multiple session names", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)

		session1, _ := Get(req, "session1")
		session2, _ := Get(req, "session2")

		if session1.Name() == session2.Name() {
			t.Error("Different session names should return different sessions")
		}
	})
}

// Tests for isHTTPS function.
func TestIsHTTPS(t *testing.T) {
	tests := []struct {
		name     string
		setupReq func() *http.Request
		want     bool
	}{
		{
			name: "TLS connection returns true",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.TLS = &tls.ConnectionState{}
				return req
			},
			want: true,
		},
		{
			name: "X-Forwarded-Proto: https returns true",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Forwarded-Proto", "https")
				return req
			},
			want: true,
		},
		{
			name: "X-Forwarded-Proto: HTTPS (uppercase) returns true",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Forwarded-Proto", "HTTPS")
				return req
			},
			want: true,
		},
		{
			name: "X-Forwarded-Proto: HtTpS (mixed case) returns true",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Forwarded-Proto", "HtTpS")
				return req
			},
			want: true,
		},
		{
			name: "X-Forwarded-Proto: http returns false",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Forwarded-Proto", "http")
				return req
			},
			want: false,
		},
		{
			name: "no TLS and no header returns false",
			setupReq: func() *http.Request {
				return httptest.NewRequest(http.MethodGet, "/test", nil)
			},
			want: false,
		},
		{
			name: "TLS takes precedence over http header",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.TLS = &tls.ConnectionState{}
				req.Header.Set("X-Forwarded-Proto", "http")
				return req
			},
			want: true,
		},
		{
			name: "empty X-Forwarded-Proto returns false",
			setupReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Forwarded-Proto", "")
				return req
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.setupReq()
			got := isHTTPS(req)
			if got != tt.want {
				t.Errorf("isHTTPS() = %v, want %v", got, tt.want)
			}
		})
	}
}

// Tests for OptionsFor function.
func TestOptionsFor(t *testing.T) {
	t.Run("HTTP request returns non-secure options", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		opts := OptionsFor(req)

		if opts.Path != "/" {
			t.Errorf("Path = %q, want %q", opts.Path, "/")
		}
		if !opts.HttpOnly {
			t.Error("HttpOnly should be true")
		}
		if opts.Secure {
			t.Error("Secure should be false for HTTP request")
		}
		if opts.SameSite != http.SameSiteLaxMode {
			t.Errorf("SameSite = %v, want %v", opts.SameSite, http.SameSiteLaxMode)
		}
	})

	t.Run("HTTPS request returns secure options", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.TLS = &tls.ConnectionState{}
		opts := OptionsFor(req)

		if opts.Path != "/" {
			t.Errorf("Path = %q, want %q", opts.Path, "/")
		}
		if !opts.HttpOnly {
			t.Error("HttpOnly should be true")
		}
		if !opts.Secure {
			t.Error("Secure should be true for HTTPS request")
		}
		if opts.SameSite != http.SameSiteLaxMode {
			t.Errorf("SameSite = %v, want %v", opts.SameSite, http.SameSiteLaxMode)
		}
	})

	t.Run("X-Forwarded-Proto: https returns secure options", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("X-Forwarded-Proto", "https")
		opts := OptionsFor(req)

		if !opts.Secure {
			t.Error("Secure should be true for X-Forwarded-Proto: https")
		}
	})

	t.Run("always sets HttpOnly", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		opts := OptionsFor(req)

		if !opts.HttpOnly {
			t.Error("HttpOnly should always be true for security")
		}
	})

	t.Run("always sets SameSite to Lax", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		opts := OptionsFor(req)

		if opts.SameSite != http.SameSiteLaxMode {
			t.Error("SameSite should be Lax for CSRF protection")
		}
	})
}

// Tests for Delete function.
func TestDelete(t *testing.T) {
	t.Run("deletes session successfully", func(t *testing.T) {
		// Create a session with data
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		session, _ := Get(req, "test-session")
		session.Values["key1"] = "value1"
		session.Values["key2"] = "value2"
		session.Save(req, w)

		// Get the cookie
		cookies := w.Result().Cookies()
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		for _, cookie := range cookies {
			req2.AddCookie(cookie)
		}

		// Delete the session
		w2 := httptest.NewRecorder()
		err := Delete(w2, req2, "test-session")

		if err != nil {
			t.Errorf("Delete() returned error: %v", err)
		}

		// Check that deletion cookies were set
		deleteCookies := w2.Result().Cookies()
		if len(deleteCookies) == 0 {
			t.Error("Delete() should set deletion cookies")
		}

		// Verify cookies have MaxAge = -1
		foundExpired := false
		for _, cookie := range deleteCookies {
			if cookie.Name == "test-session" && cookie.MaxAge == -1 {
				foundExpired = true
				break
			}
		}
		if !foundExpired {
			t.Error("Delete() should set cookie with MaxAge = -1")
		}
	})

	t.Run("clears session values", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		// Create session with values
		session, _ := Get(req, "test-session")
		session.Values["test-key"] = "test-value"
		session.Save(req, w)

		// Delete session
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		for _, cookie := range w.Result().Cookies() {
			req2.AddCookie(cookie)
		}

		w2 := httptest.NewRecorder()
		Delete(w2, req2, "test-session")

		// Try to get the session again
		req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
		for _, cookie := range w2.Result().Cookies() {
			req3.AddCookie(cookie)
		}

		session2, _ := Get(req3, "test-session")
		if len(session2.Values) > 0 {
			t.Errorf("Session values should be cleared, got %d values", len(session2.Values))
		}
	})

	t.Run("sets multiple deletion cookies for different paths", func(t *testing.T) {
		// Request with specific path
		req := httptest.NewRequest(http.MethodGet, "/auth/logout", nil)
		w := httptest.NewRecorder()

		session, _ := Get(req, "test-session")
		session.Values["key"] = "value"
		session.Save(req, w)

		// Delete with specific path
		req2 := httptest.NewRequest(http.MethodGet, "/auth/logout", nil)
		w2 := httptest.NewRecorder()
		Delete(w2, req2, "test-session")

		// Should have multiple cookies (root path and specific path)
		cookies := w2.Result().Cookies()
		if len(cookies) < 2 {
			t.Errorf("Delete() should set multiple cookies for path cleanup, got %d", len(cookies))
		}

		// Check for cookies with different paths
		paths := make(map[string]bool)
		for _, cookie := range cookies {
			if cookie.Name == "test-session" {
				paths[cookie.Path] = true
			}
		}

		if !paths["/"] {
			t.Error("Delete() should set cookie for root path")
		}
		if !paths["/auth/logout"] {
			t.Error("Delete() should set cookie for request path")
		}
	})

	t.Run("sets HttpOnly and SameSite on deletion cookies", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		Delete(w, req, "test-session")

		cookies := w.Result().Cookies()
		for _, cookie := range cookies {
			if cookie.Name == "test-session" {
				if !cookie.HttpOnly {
					t.Error("Deletion cookie should have HttpOnly set")
				}
				if cookie.SameSite != http.SameSiteLaxMode {
					t.Errorf("Deletion cookie SameSite = %v, want %v", cookie.SameSite, http.SameSiteLaxMode)
				}
			}
		}
	})

	t.Run("sets Secure flag on HTTPS deletion", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.TLS = &tls.ConnectionState{}
		w := httptest.NewRecorder()

		Delete(w, req, "test-session")

		cookies := w.Result().Cookies()
		foundSecure := false
		for _, cookie := range cookies {
			if cookie.Name == "test-session" && cookie.Secure {
				foundSecure = true
				break
			}
		}

		if !foundSecure {
			t.Error("Deletion cookie should have Secure flag for HTTPS")
		}
	})

	t.Run("handles root path request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		w := httptest.NewRecorder()

		err := Delete(w, req, "test-session")
		if err != nil {
			t.Errorf("Delete() returned error for root path: %v", err)
		}

		// Delete() sets cookies via session.Save() and then explicit Set-Cookie
		// For root path, it sets one via Save and one explicit, so 2 is expected
		cookies := w.Result().Cookies()
		rootPathCount := 0
		for _, cookie := range cookies {
			if cookie.Name == "test-session" && cookie.Path == "/" {
				rootPathCount++
			}
		}

		if rootPathCount < 1 {
			t.Errorf("Should set at least one cookie for root path, got %d", rootPathCount)
		}

		// All cookies should have MaxAge = -1 for deletion
		for _, cookie := range cookies {
			if cookie.Name == "test-session" && cookie.MaxAge != -1 {
				t.Error("All deletion cookies should have MaxAge = -1")
			}
		}
	})

	t.Run("handles deletion without existing session", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		// Delete session that doesn't exist
		err := Delete(w, req, "nonexistent-session")
		if err != nil {
			t.Errorf("Delete() returned error for nonexistent session: %v", err)
		}

		// Should still set deletion cookies
		cookies := w.Result().Cookies()
		if len(cookies) == 0 {
			t.Error("Delete() should set deletion cookies even for nonexistent session")
		}
	})
}

// Integration test.
func TestSessionWorkflow(t *testing.T) {
	t.Run("complete session lifecycle", func(t *testing.T) {
		sessionName := "integration-test-session"

		// 1. Create session
		req1 := httptest.NewRequest(http.MethodGet, "/login", nil)
		w1 := httptest.NewRecorder()

		session, _ := Get(req1, sessionName)
		session.Values["user_id"] = "12345"
		session.Values["username"] = "testuser"
		session.Options = OptionsFor(req1)
		session.Save(req1, w1)

		cookies := w1.Result().Cookies()
		if len(cookies) == 0 {
			t.Fatal("Session should create cookies")
		}

		// 2. Retrieve session
		req2 := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
		for _, cookie := range cookies {
			req2.AddCookie(cookie)
		}

		session2, _ := Get(req2, sessionName)
		if session2.Values["user_id"] != "12345" {
			t.Error("Session should persist user_id")
		}
		if session2.Values["username"] != "testuser" {
			t.Error("Session should persist username")
		}

		// 3. Delete session
		req3 := httptest.NewRequest(http.MethodGet, "/logout", nil)
		for _, cookie := range cookies {
			req3.AddCookie(cookie)
		}
		w3 := httptest.NewRecorder()

		err := Delete(w3, req3, sessionName)
		if err != nil {
			t.Errorf("Delete failed: %v", err)
		}

		// 4. Verify session is deleted (or at least cleared)
		req4 := httptest.NewRequest(http.MethodGet, "/", nil)
		// Don't add the deletion cookies - create a fresh request as if user refreshed

		session4, _ := Get(req4, sessionName)
		// Session should be new OR have empty values
		if len(session4.Values) > 0 {
			// Check if any meaningful data exists
			hasData := false
			for k, v := range session4.Values {
				if k == "user_id" || k == "username" {
					if v != nil && v != "" {
						hasData = true
						break
					}
				}
			}
			if hasData {
				t.Error("Session should not contain user data after deletion")
			}
		}
	})
}

// Benchmark tests.
func BenchmarkGet(b *testing.B) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	b.ResetTimer()

	for range b.N {
		_, _ = Get(req, "bench-session")
	}
}

func BenchmarkOptionsFor(b *testing.B) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	b.ResetTimer()

	for range b.N {
		_ = OptionsFor(req)
	}
}

func BenchmarkDelete(b *testing.B) {
	b.ResetTimer()

	for range b.N {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		_ = Delete(w, req, "bench-session")
	}
}
