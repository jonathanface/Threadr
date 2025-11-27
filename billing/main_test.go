package billing

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	//stripe "github.com/stripe/stripe-go/v79"
)

func TestSubscribeCustomerEndpoint(t *testing.T) {
	// allow tests to stub user email and ensureCustomer
	t.Cleanup(func() {
		getUserEmailFn = getUserEmail
		ensureCustomerFn = ensureCustomer
	})
	getUserEmailFn = func(r *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(u *models.UserInfo, s *models.Subscription) (string, error) { return "cus_123", nil }

	daoMock := daos.NewMockDAO()
	daoMock.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}

	type tc struct {
		name         string
		envPriceID   string
		dao          daos.DaoInterface
		spec         stripeRouteSpec
		wantStatus   int
		wantContains string // substring in JSON body
	}
	cases := []tc{
		{
			name:         "missing price id",
			envPriceID:   "",
			dao:          daoMock,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"missing stripe price id"`,
		},
		// {
		// 	name:         "success: returns client secret and subscription id",
		// 	envPriceID:   "price_ABC",
		// 	dao:          daoMock,
		// 	spec:         stripeRouteSpec{}, // defaults create with PI
		// 	wantStatus:   http.StatusOK,
		// 	wantContains: `"client-secret":"pi_123_secret_abc"`,
		// },
		{
			name:         "stripe create returns subscription without payment_intent → 424",
			envPriceID:   "price_ABC",
			dao:          daoMock,
			spec:         stripeRouteSpec{CreateSubNoPI: true},
			wantStatus:   http.StatusFailedDependency,
			wantContains: `"error":"missing payment_intent"`,
		},
		{
			name:       "stripe create error",
			envPriceID: "price_ABC",
			dao:        daoMock,
			spec:       stripeRouteSpec{CreateSubShouldError: true},
			wantStatus: http.StatusInternalServerError, // handler uses http.Error for Stripe err → 500
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Suppress Stripe SDK error logs for test cases expecting errors
			if c.spec.CreateSubShouldError {
				origStderr := os.Stderr
				os.Stderr, _ = os.Open(os.DevNull)
				defer func() { os.Stderr = origStderr }()
			}

			srv := newStripeServer(t, c.spec)
			defer srv.Close()
			restore := setStripeBackendToServer(t, srv)
			defer restore()

			if c.envPriceID != "" {
				t.Setenv("STRIPE_PRICE_ID", c.envPriceID)
			} else {
				_ = os.Unsetenv("STRIPE_PRICE_ID")
			}

			req := httptest.NewRequest(http.MethodPost, "/billing/subscribe", nil)
			// inject DAO
			ctx := req.Context()
			ctx = contextWithDAO(ctx, c.dao)
			req = req.WithContext(ctx)

			rec := httptest.NewRecorder()
			SubscribeCustomerEndpoint(rec, req)

			res := rec.Result()
			defer res.Body.Close()

			if res.StatusCode != c.wantStatus {
				t.Fatalf("status %d, want %d", res.StatusCode, c.wantStatus)
			}
			if c.wantContains != "" {
				body, _ := io.ReadAll(res.Body)
				got := compactJSON(body)
				if !strings.Contains(got, c.wantContains) {
					t.Fatalf("body %s, expected to contain %q", got, c.wantContains)
				}
			}
		})
	}
}

// ------------------------------------------------------------
// BillingSummaryEndpoint tests
// ------------------------------------------------------------

func TestBillingSummaryEndpoint(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })

	getUserEmailFn = func(r *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(u *models.UserInfo, s *models.Subscription) (string, error) { return "cus_123", nil }

	// Happy-path DAO
	daoMock := daos.NewMockDAO()
	daoMock.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: strings.ToLower(email)}, nil
	}

	// Error DAO
	daoMockError := daos.NewMockDAO()
	daoMockError.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, fmt.Errorf("db down")
	}

	now := time.Now().UTC().Truncate(time.Second)

	type tc struct {
		name               string
		dao                daos.DaoInterface
		spec               stripeRouteSpec
		wantStatus         int
		wantContains       string
		overrideGetUserErr error
		daoMissing         bool
		after              func(t *testing.T) // optional extra assertions
		setupDAO           func()             // per-case DAO mock wiring
	}

	var updateCalled atomic.Bool
	cases := []tc{
		{
			name:               "unauthorized if getUserEmail fails",
			overrideGetUserErr: fmt.Errorf("no token"),
			dao:                daoMockError,
			wantStatus:         http.StatusUnauthorized,
		},
		{
			name:         "DAO missing",
			daoMissing:   true,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"DAO missing from context"`,
		},
		{
			name:         "user load error",
			dao:          daoMockError,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"unable to load user"`,
		},
		{
			name: "returns active subscription (stripe GET)",
			dao:  daoMock,
			setupDAO: func() {
				updateCalled.Store(false)
				daoMock.MockGetSubscription = func(email string) (*models.Subscription, error) {
					// must return a non-nil sub with an ID
					return &models.Subscription{SubscriptionID: "sub_123"}, nil
				}
				daoMock.MockUpdateSubscription = func(s models.Subscription) error {
					// optional sanity checks; don't require CustomerID if you didn't expand it
					if s.LastSubCheck.IsZero() {
						return fmt.Errorf("LastSubCheck not set")
					}
					updateCalled.Store(true)
					return nil
				}
			},
			spec: stripeRouteSpec{
				GetSubID:                "sub_123",
				GetSubStatus:            "active",
				GetSubCurrentPeriodEnd:  now.Unix(),
				GetSubCancelAtPeriodEnd: false,
				GetSubCustomerID:        "cus_456", // optional; include if your endpoint reads it
			},
			wantStatus:   http.StatusOK,
			wantContains: `"status":"active"`,
			after: func(t *testing.T) {
				if !updateCalled.Load() {
					t.Fatalf("expected UpdateSubscription to be called")
				}
			},
		},
		{
			name: "no subscriptions found → status none",
			dao:  daoMock,
			setupDAO: func() {
				daoMock.MockGetSubscription = func(email string) (*models.Subscription, error) {
					return nil, sql.ErrNoRows
				}
				daoMock.MockUpdateSubscription = func(s models.Subscription) error { return nil }
			},
			wantStatus:   http.StatusOK,
			wantContains: `"status":"none"`,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.overrideGetUserErr != nil {
				getUserEmailFn = func(r *http.Request) (string, error) { return "", c.overrideGetUserErr }
			} else {
				getUserEmailFn = func(r *http.Request) (string, error) { return "user@example.com", nil }
			}

			if c.setupDAO != nil {
				c.setupDAO()
			}

			// Spin up a fake Stripe server that serves GET /v1/subscriptions/{id}
			srv := newStripeServer(t, c.spec) // must handle GET /v1/subscriptions/:id using spec
			defer srv.Close()
			restore := setStripeBackendToServer(t, srv)
			defer restore()

			req := httptest.NewRequest(http.MethodGet, "/billing/summary", nil)
			if !c.daoMissing {
				req = req.WithContext(contextWithDAO(req.Context(), c.dao))
			}
			rec := httptest.NewRecorder()

			BillingSummaryEndpoint(rec, req)

			res := rec.Result()
			defer res.Body.Close()

			if res.StatusCode != c.wantStatus {
				t.Fatalf("status %d, want %d", res.StatusCode, c.wantStatus)
			}
			if c.wantContains != "" {
				body, _ := io.ReadAll(res.Body)
				got := compactJSON(body)
				if !strings.Contains(got, c.wantContains) {
					t.Fatalf("body %s, expected to contain %q", got, c.wantContains)
				}
			}
			if c.after != nil {
				c.after(t)
			}
		})
	}
}

// ------------------------------------------------------------
// BillingPortalSessionEndpoint tests
// ------------------------------------------------------------

func TestBillingPortalSessionEndpoint(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })
	getUserEmailFn = func(r *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(u *models.UserInfo, s *models.Subscription) (string, error) { return "cus_123", nil }

	daoMock := daos.NewMockDAO()
	daoMock.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}

	daoMockError := daos.NewMockDAO()
	daoMockError.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return nil, fmt.Errorf("db down")
	}

	type tc struct {
		name           string
		dao            daos.DaoInterface
		spec           stripeRouteSpec
		wantStatus     int
		wantContains   string
		userErr        error
		daoMissing     bool
		setHeaderRet   string // if non-empty, set X-Return-Url header
		expectRedirect string // expected url in json
	}
	cases := []tc{
		{
			name:       "unauthorized when getUserEmail fails",
			userErr:    fmt.Errorf("no token"),
			dao:        daoMockError,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:         "DAO missing",
			daoMissing:   true,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"DAO missing from context"`,
		},
		{
			name:         "user load error",
			dao:          daoMockError,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"unable to load user"`,
		},
		{
			name:           "success with custom return url header",
			dao:            daoMock,
			spec:           stripeRouteSpec{PortalURL: "https://stripe.test/portal/ok"},
			setHeaderRet:   "http://localhost/success",
			expectRedirect: "https://stripe.test/portal/ok",
			wantStatus:     http.StatusOK,
		},
		{
			name:           "success without header uses host-derived url",
			dao:            daoMock,
			spec:           stripeRouteSpec{PortalURL: "https://stripe.test/portal/alt"},
			expectRedirect: "https://stripe.test/portal/alt",
			wantStatus:     http.StatusOK,
		},
		{
			name:         "stripe portal error → 502",
			dao:          daoMock,
			spec:         stripeRouteSpec{PortalShouldError: true},
			wantStatus:   http.StatusBadGateway,
			wantContains: `"error":"stripe portal error:`,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Suppress Stripe SDK error logs for test cases expecting errors
			if c.spec.PortalShouldError || c.spec.CreateSubShouldError {
				origStderr := os.Stderr
				os.Stderr, _ = os.Open(os.DevNull)
				defer func() { os.Stderr = origStderr }()
			}

			if c.userErr != nil {
				getUserEmailFn = func(r *http.Request) (string, error) { return "", c.userErr }
			} else {
				getUserEmailFn = func(r *http.Request) (string, error) { return "user@example.com", nil }
			}

			srv := newStripeServer(t, c.spec)
			defer srv.Close()
			restore := setStripeBackendToServer(t, srv)
			defer restore()

			req := httptest.NewRequest(http.MethodPost, "/billing/portal-session", nil)
			req.Host = "example.test" // used when header missing
			if c.setHeaderRet != "" {
				req.Header.Set("X-Return-Url", c.setHeaderRet)
			}
			if !c.daoMissing {
				req = req.WithContext(contextWithDAO(req.Context(), c.dao))
			}

			rec := httptest.NewRecorder()
			BillingPortalSessionEndpoint(rec, req)
			res := rec.Result()
			defer res.Body.Close()

			if res.StatusCode != c.wantStatus {
				t.Fatalf("status %d, want %d", res.StatusCode, c.wantStatus)
			}
			if c.wantContains != "" || c.expectRedirect != "" {
				body, _ := io.ReadAll(res.Body)
				got := compactJSON(body)
				if c.wantContains != "" && !strings.Contains(got, c.wantContains) {
					t.Fatalf("body %s, expected to contain %q", got, c.wantContains)
				}
				if c.expectRedirect != "" && !strings.Contains(got, c.expectRedirect) {
					t.Fatalf("body %s, expected to contain redirect %q", got, c.expectRedirect)
				}
			}
		})
	}
}

// ------------------------------------------------------------
// Small helper to inject DAO in request context
// ------------------------------------------------------------

func contextWithDAO(ctx context.Context, dao daos.DaoInterface) context.Context {
	return context.WithValue(ctx, ctxkey.DAO, dao)
}
