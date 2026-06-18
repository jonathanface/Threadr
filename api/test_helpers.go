package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"

	ctxkey "Threadr/ctxkeys"
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
	req = AddSessionCookieToRequest(req, "test@example.com")
	// Default to a subscribed user so handler-level RequireSubscriber gates
	// pass; tests that exercise the gate explicitly should override with
	// req.WithContext(context.WithValue(..., ctxkey.Subscriber, false)).
	return req.WithContext(context.WithValue(req.Context(), ctxkey.Subscriber, true))
}
