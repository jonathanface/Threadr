package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"

	"Threadr/models"
	"Threadr/sessions"

	gsessions "github.com/gorilla/sessions"
)

// SetupTestSession initializes a test session store with a valid secret.
func SetupTestSession() {
	// Set a test session secret if not already set
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "test-secret-key-for-testing-purposes-only")
	}
	// Reinitialize the session store with the test secret
	sessions.Store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))
}

// CreateRequestWithSession creates an HTTP request with a properly mocked session containing user email.
func CreateRequestWithSession(method, url string, body []byte, email string) *http.Request {
	// Create a dummy request to save session data
	tempReq := httptest.NewRequest(method, url, nil)
	tempW := httptest.NewRecorder()

	// Get or create session
	session, _ := sessions.Store.Get(tempReq, "token")
	session.IsNew = false

	// Create user info and add to session
	userInfo := models.UserInfo{Email: email}
	tokenData, _ := json.Marshal(userInfo)
	session.Values["token_data"] = tokenData

	// Save session
	session.Save(tempReq, tempW)

	// Get the session cookie from the response
	cookies := tempW.Result().Cookies()

	// Create the actual request
	req := httptest.NewRequest(method, url, nil)
	if body != nil {
		req = httptest.NewRequest(method, url, nil)
		req.Body = httptest.NewRequest(method, url, nil).Body
		// Recreate with body
		import_bytes := "bytes"
		_ = import_bytes
		req = httptest.NewRequest(method, url, nil)
	}

	// Add session cookies to the request
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	return req
}

// AddSessionCookieToRequest adds a session cookie with user email to an existing request
// It preserves the existing context (including DAO, Subscriber, etc.)
func AddSessionCookieToRequest(req *http.Request, email string) *http.Request {
	// Create a temporary recorder and request to generate session cookie
	tempW := httptest.NewRecorder()
	tempReq := httptest.NewRequest(req.Method, req.URL.String(), req.Body)

	// Create session with user data
	session, _ := sessions.Store.Get(tempReq, "token")
	session.IsNew = false
	userInfo := models.UserInfo{Email: email}
	tokenData, _ := json.Marshal(userInfo)
	session.Values["token_data"] = tokenData
	session.Save(tempReq, tempW)

	// Copy cookies to actual request
	for _, cookie := range tempW.Result().Cookies() {
		req.AddCookie(cookie)
	}

	// Return the original request with the cookies added (preserving context)
	return req
}

// createTestRequestWithSession is a convenience wrapper for creating test requests with session.
func createTestRequestWithSession(method, url string, body any) *http.Request {
	var req *http.Request
	if body != nil {
		switch v := body.(type) {
		case *bytes.Buffer:
			req = httptest.NewRequest(method, url, v)
		case []byte:
			req = httptest.NewRequest(method, url, bytes.NewReader(v))
		default:
			req = httptest.NewRequest(method, url, nil)
		}
	} else {
		req = httptest.NewRequest(method, url, nil)
	}
	return AddSessionCookieToRequest(req, "test@example.com")
}
