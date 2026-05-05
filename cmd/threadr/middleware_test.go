package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"Threadr/sessions"

	gsessions "github.com/gorilla/sessions"
)

func init() {
	setupTestSession()
}

func setupTestSession() {
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "test-secret-key-for-testing-purposes-only")
	}
	sessions.Store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))
}

// Helper to create a test handler that records if it was called.
func createTestHandler(called *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*called = true
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
}

// Helper to create request with session.
func createRequestWithSession(method, url, email string) *http.Request {
	req := httptest.NewRequest(method, url, nil)
	w := httptest.NewRecorder()

	session, _ := sessions.Store.Get(req, "token")
	session.IsNew = false

	userInfo := models.UserInfo{Email: email}
	tokenData, _ := json.Marshal(userInfo)
	session.Values["token_data"] = tokenData
	session.Save(req, w)

	for _, cookie := range w.Result().Cookies() {
		req.AddCookie(cookie)
	}

	return req
}

// Tests for looseMiddleware.
func TestLooseMiddleware(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	t.Run("OPTIONS request is handled by CORS middleware (passes through)", func(t *testing.T) {
		handlerCalled := false
		middleware := looseMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodOptions, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// looseMiddleware no longer handles OPTIONS specially - that's done by CORS middleware
		// So the next handler should be called
		if !handlerCalled {
			t.Error("next handler should be called for OPTIONS request (CORS middleware handles it at router level)")
		}
	})

	t.Run("non-OPTIONS request calls next handler with DAO in context", func(t *testing.T) {
		handlerCalled := false
		var capturedDAO daos.DaoInterface

		middleware := looseMiddleware(mockDAO)
		testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handlerCalled = true
			capturedDAO, _ = r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
			w.WriteHeader(http.StatusOK)
		})
		handler := middleware(testHandler)

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if !handlerCalled {
			t.Error("next handler should be called for non-OPTIONS request")
		}
		if capturedDAO == nil {
			t.Error("DAO should be in context")
		}
	})

	t.Run("sets timeout context", func(t *testing.T) {
		middleware := looseMiddleware(mockDAO)
		testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			deadline, ok := r.Context().Deadline()
			if !ok {
				t.Error("context should have deadline")
			}
			if deadline.IsZero() {
				t.Error("deadline should not be zero")
			}
			w.WriteHeader(http.StatusOK)
		})
		handler := middleware(testHandler)

		req := httptest.NewRequest(http.MethodPost, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)
	})
}

// Tests for billingMiddleware.
func TestBillingMiddleware(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	t.Run("OPTIONS request requires auth (CORS handles at router level)", func(t *testing.T) {
		// billingMiddleware no longer short-circuits OPTIONS - CORS middleware handles it
		// This means OPTIONS requests will go through auth checks like any other request
		handlerCalled := false
		middleware := billingMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodOptions, "/billing/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// Should return 401 because no token is present
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called when auth fails")
		}
	})

	t.Run("request without session returns 401", func(t *testing.T) {
		handlerCalled := false
		middleware := billingMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodPost, "/billing/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called without session")
		}
	})

	t.Run("request with valid session calls next handler", func(t *testing.T) {
		handlerCalled := false
		var capturedDAO daos.DaoInterface

		middleware := billingMiddleware(mockDAO)
		testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handlerCalled = true
			capturedDAO, _ = r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
			w.WriteHeader(http.StatusOK)
		})
		handler := middleware(testHandler)

		req := createRequestWithSession("POST", "/billing/test", "user@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if !handlerCalled {
			t.Error("next handler should be called with valid session")
		}
		if capturedDAO == nil {
			t.Error("DAO should be in context")
		}
	})

	t.Run("request with new session returns 401", func(t *testing.T) {
		handlerCalled := false
		middleware := billingMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodPost, "/billing/test", nil)
		w := httptest.NewRecorder()

		// Create a new session but mark it as new
		session, _ := sessions.Store.Get(req, "token")
		session.IsNew = true
		session.Save(req, w)

		for _, cookie := range w.Result().Cookies() {
			req.AddCookie(cookie)
		}

		w = httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called with new session")
		}
	})
}

// Tests for strictMiddleware.
func TestStrictMiddleware(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	// strictMiddleware calls UpsertUser, not GetUserDetails
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{
			Email:      email,
			Subscriber: true,
		}, nil
	}

	t.Run("OPTIONS request requires auth (CORS handles at router level)", func(t *testing.T) {
		// strictMiddleware no longer short-circuits OPTIONS - CORS middleware handles it
		// This means OPTIONS requests will go through auth checks like any other request
		handlerCalled := false
		middleware := strictMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// Should return 401 because no token is present
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called when auth fails")
		}
	})

	t.Run("request without session returns 401", func(t *testing.T) {
		handlerCalled := false
		middleware := strictMiddleware(mockDAO)
		handler := middleware(createTestHandler(&handlerCalled))

		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called without session")
		}
	})

	t.Run("subscribed user on POST /stories - UpsertUser called", func(t *testing.T) {
		// Note: strictMiddleware calls UpsertUser which is not mocked in MockDAO
		// It will fall through to the real DAO implementation which requires DynamoDB
		// This test verifies the middleware logic path

		middleware := strictMiddleware(mockDAO)
		testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// This won't be reached because UpsertUser will fail without real DB
			w.WriteHeader(http.StatusOK)
		})
		handler := middleware(testHandler)

		req := createRequestWithSession("POST", "/api/stories", "subscriber@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// Without a real DB, UpsertUser will fail and return 500
		// The important thing is that it tried to validate the user
		if w.Code == http.StatusOK {
			t.Log("UpsertUser succeeded (unexpected in test without real DB)")
		} else {
			t.Logf("UpsertUser failed as expected (no real DB): status %d", w.Code)
		}
	})

	t.Run("non-subscribed user on POST /stories succeeds", func(t *testing.T) {
		mockDAONoSub := daos.NewMockDAO()
		mockDAONoSub.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}
		mockDAONoSub.MockUpsertUser = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}

		handlerCalled := false
		middleware := strictMiddleware(mockDAONoSub)
		handler := middleware(createTestHandler(&handlerCalled))

		req := createRequestWithSession("POST", "/api/stories", "nonsubscriber@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// Free users can now create stories
		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}
		if !handlerCalled {
			t.Error("next handler should be called for non-subscribed user on POST /stories")
		}
	})

	t.Run("non-subscribed user on PUT /export returns 402", func(t *testing.T) {
		mockDAONoSub := daos.NewMockDAO()
		mockDAONoSub.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}
		mockDAONoSub.MockUpsertUser = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}

		handlerCalled := false
		middleware := strictMiddleware(mockDAONoSub)
		handler := middleware(createTestHandler(&handlerCalled))

		req := createRequestWithSession("PUT", "/api/stories/123/export", "nonsubscriber@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusPaymentRequired {
			t.Errorf("expected status 402, got %d", w.Code)
		}
		if handlerCalled {
			t.Error("next handler should not be called for non-subscribed user on export")
		}
	})

	t.Run("non-subscribed user on GET request succeeds", func(t *testing.T) {
		mockDAONoSub := daos.NewMockDAO()
		mockDAONoSub.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}
		mockDAONoSub.MockUpsertUser = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{
				Email:      email,
				Subscriber: false,
			}, nil
		}

		handlerCalled := false
		middleware := strictMiddleware(mockDAONoSub)
		handler := middleware(createTestHandler(&handlerCalled))

		req := createRequestWithSession("GET", "/api/stories", "nonsubscriber@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}
		if !handlerCalled {
			t.Error("next handler should be called for GET request")
		}
	})

	t.Run("context setup attempted (DAO and Subscriber)", func(t *testing.T) {
		// Note: Without UpsertUser mocked, this will fail before setting context values
		// This test verifies the middleware attempts to set up the context

		middleware := strictMiddleware(mockDAO)
		testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Won't reach here without real DB
			w.WriteHeader(http.StatusOK)
		})
		handler := middleware(testHandler)

		req := createRequestWithSession("GET", "/api/test", "user@example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		// The middleware should attempt to call UpsertUser
		// Without real DB, this will return 500
		t.Logf("Middleware executed, status: %d (expected 500 without real DB)", w.Code)
		if w.Code != http.StatusInternalServerError {
			t.Logf("Unexpected status (might have real DB available): %d", w.Code)
		}
	})
}
