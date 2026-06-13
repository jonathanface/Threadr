package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/stripe/stripe-go/v79/webhook"
)

func TestSubscribeCustomerEndpoint(t *testing.T) {
	// allow tests to stub user email and ensureCustomer
	t.Cleanup(func() {
		getUserEmailFn = getUserEmail
		ensureCustomerFn = ensureCustomer
	})
	getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) { return "cus_123", nil }

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
	// DAO that returns an error from GetUserDetails — used by the
	// "user-lookup failure" case below.
	daoUserErr := daos.NewMockDAO()
	daoUserErr.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, errors.New("user lookup blew up")
	}

	// DAO that returns a non-ErrNoRows error from GetSubscription.
	daoSubErr := daos.NewMockDAO()
	daoSubErr.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}
	daoSubErr.MockGetSubscription = func(_ string) (*models.Subscription, error) {
		return nil, errors.New("dynamo on fire")
	}

	// DAO that returns ErrNoRows from GetSubscription — this should be
	// treated as "no existing subscription" and proceed to create one.
	daoNoSub := daos.NewMockDAO()
	daoNoSub.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}
	daoNoSub.MockGetSubscription = func(_ string) (*models.Subscription, error) {
		return nil, sql.ErrNoRows
	}

	// DAO whose UpdateSubscription fails after a successful Stripe create.
	daoUpdateErr := daos.NewMockDAO()
	daoUpdateErr.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}
	daoUpdateErr.MockUpdateSubscription = func(_ models.Subscription) error {
		return errors.New("dynamo write failed")
	}

	cases := []tc{
		{
			name:         "missing price id",
			envPriceID:   "",
			dao:          daoMock,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"missing stripe price id"`,
		},
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
		{
			name:         "user-lookup failure returns 500",
			envPriceID:   "price_ABC",
			dao:          daoUserErr,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"unable to parse or retrieve user info"`,
		},
		{
			name:         "GetSubscription DB error (not ErrNoRows) returns 500",
			envPriceID:   "price_ABC",
			dao:          daoSubErr,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"unable to load subscription"`,
		},
		{
			name:         "GetSubscription returns ErrNoRows: proceeds to create a new subscription",
			envPriceID:   "price_ABC",
			dao:          daoNoSub,
			spec:         stripeRouteSpec{}, // mock server's default create returns a PI
			wantStatus:   http.StatusOK,
			wantContains: `"subscription_id":"sub_new_123"`,
		},
		{
			name:         "UpdateSubscription error after successful Stripe create returns 500",
			envPriceID:   "price_ABC",
			dao:          daoUpdateErr,
			spec:         stripeRouteSpec{},
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"unable to update subscription"`,
		},
		{
			name:         "happy path: returns subscription id, client secret, and status",
			envPriceID:   "price_ABC",
			dao:          daoMock,
			spec:         stripeRouteSpec{CreateSubID: "sub_42"},
			wantStatus:   http.StatusOK,
			wantContains: `"subscription_id":"sub_42"`,
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

// SubscribeCustomerEndpoint: edge cases that don't fit the table — they
// need to swap test seams or omit the DAO from request context entirely.

func TestSubscribeCustomerEndpoint_GetUserEmailError(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })
	getUserEmailFn = func(_ *http.Request) (string, error) { return "", errors.New("no session") }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) { return "cus_123", nil }
	t.Setenv("STRIPE_PRICE_ID", "price_ABC")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/billing/subscribe", nil)
	req = req.WithContext(contextWithDAO(req.Context(), daos.NewMockDAO()))

	SubscribeCustomerEndpoint(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500. body=%s", rec.Code, rec.Body.String())
	}
}

func TestSubscribeCustomerEndpoint_DAOMissingFromContext(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })
	getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) { return "cus_123", nil }
	t.Setenv("STRIPE_PRICE_ID", "price_ABC")

	rec := httptest.NewRecorder()
	// no DAO injected
	req := httptest.NewRequest(http.MethodPost, "/billing/subscribe", nil)

	SubscribeCustomerEndpoint(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "unable to parse or retrieve dao from context") {
		t.Fatalf("body %s, expected DAO-missing error", rec.Body.String())
	}
}

func TestSubscribeCustomerEndpoint_EnsureCustomerError(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })
	getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) {
		return "", errors.New("stripe customer create failed")
	}
	t.Setenv("STRIPE_PRICE_ID", "price_ABC")

	dao := daos.NewMockDAO()
	dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/billing/subscribe", nil)
	req = req.WithContext(contextWithDAO(req.Context(), dao))

	SubscribeCustomerEndpoint(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", rec.Code)
	}
}

// ------------------------------------------------------------
// BillingSummaryEndpoint tests
// ------------------------------------------------------------

func TestBillingSummaryEndpoint(t *testing.T) {
	t.Cleanup(func() { getUserEmailFn = getUserEmail; ensureCustomerFn = ensureCustomer })

	getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) { return "cus_123", nil }

	// Happy-path DAO
	daoMock := daos.NewMockDAO()
	daoMock.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: strings.ToLower(email)}, nil
	}

	// Error DAO
	daoMockError := daos.NewMockDAO()
	daoMockError.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, errors.New("db down")
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
			overrideGetUserErr: errors.New("no token"),
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
				daoMock.MockGetSubscription = func(_ string) (*models.Subscription, error) {
					// must return a non-nil sub with an ID
					return &models.Subscription{SubscriptionID: "sub_123"}, nil
				}
				daoMock.MockUpdateSubscription = func(s models.Subscription) error {
					// optional sanity checks; don't require CustomerID if you didn't expand it
					if s.LastSubCheck.IsZero() {
						return errors.New("LastSubCheck not set")
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
				daoMock.MockGetSubscription = func(_ string) (*models.Subscription, error) {
					return nil, sql.ErrNoRows
				}
				daoMock.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
			},
			wantStatus:   http.StatusOK,
			wantContains: `"status":"none"`,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.overrideGetUserErr != nil {
				getUserEmailFn = func(_ *http.Request) (string, error) { return "", c.overrideGetUserErr }
			} else {
				getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
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

			SummaryEndpoint(rec, req)

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
	getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
	ensureCustomerFn = func(_ *models.UserInfo, _ *models.Subscription) (string, error) { return "cus_123", nil }

	daoMock := daos.NewMockDAO()
	daoMock.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email}, nil
	}

	daoMockError := daos.NewMockDAO()
	daoMockError.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
		return nil, errors.New("db down")
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
			userErr:    errors.New("no token"),
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
			wantContains: `"error":"Payment service error"`,
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
				getUserEmailFn = func(_ *http.Request) (string, error) { return "", c.userErr }
			} else {
				getUserEmailFn = func(_ *http.Request) (string, error) { return "user@example.com", nil }
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
			PortalSessionEndpoint(rec, req)
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
// StripeWebhookEndpoint tests
// ------------------------------------------------------------

func TestStripeWebhookEndpoint(t *testing.T) {
	type tc struct {
		name         string
		setupEnv     func(t *testing.T)
		payload      string
		signature    string
		wantStatus   int
		wantContains string
	}

	cases := []tc{
		{
			name: "missing webhook secret",
			setupEnv: func(_ *testing.T) {
				os.Unsetenv("STRIPE_WEBHOOK_SECRET")
			},
			payload:      `{"type":"customer.subscription.updated"}`,
			wantStatus:   http.StatusInternalServerError,
			wantContains: `"error":"missing webhook secret"`,
		},
		{
			name: "invalid signature verification",
			setupEnv: func(t *testing.T) {
				t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret")
				t.Setenv("AWS_REGION", "us-east-1")
			},
			signature:    "t=1,v1=invalid_signature",
			payload:      `{"type":"customer.subscription.updated"}`,
			wantStatus:   http.StatusBadRequest,
			wantContains: "Invalid request",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.setupEnv != nil {
				c.setupEnv(t)
			}

			req := httptest.NewRequest(http.MethodPost, "/billing/webhook", strings.NewReader(c.payload))
			if c.signature != "" {
				req.Header.Set("Stripe-Signature", c.signature)
			}

			rec := httptest.NewRecorder()
			StripeWebhookEndpoint(rec, req)

			res := rec.Result()
			defer res.Body.Close()

			if res.StatusCode != c.wantStatus {
				body, _ := io.ReadAll(res.Body)
				t.Fatalf("status %d, want %d. Body: %s", res.StatusCode, c.wantStatus, string(body))
			}

			if c.wantContains != "" {
				body, _ := io.ReadAll(res.Body)
				bodyStr := string(body)
				if !strings.Contains(bodyStr, c.wantContains) {
					t.Fatalf("body %s, expected to contain %q", bodyStr, c.wantContains)
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

// ------------------------------------------------------------
// Full StripeWebhookEndpoint integration tests
// ------------------------------------------------------------

// signedWebhookReq builds an *http.Request with a valid Stripe-Signature
// header for the given JSON payload + secret.
//
//nolint:unparam // secret is kept as a param so the helper reads top-to-bottom even though tests currently use a single secret.
func signedWebhookReq(t *testing.T, payload []byte, secret string) *http.Request {
	t.Helper()
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload: payload,
		Secret:  secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/billing/webhook", strings.NewReader(string(payload)))
	req.Header.Set("Stripe-Signature", signed.Header)
	return req
}

func subscriptionEventPayload(t *testing.T, eventType, subID, custID, status string, periodEnd int64) []byte {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"id":   "evt_test_" + subID,
		"type": eventType,
		"data": map[string]any{
			"object": map[string]any{
				"id":                 subID,
				"object":             "subscription",
				"customer":           custID,
				"status":             status,
				"current_period_end": periodEnd,
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return payload
}

// installMockDAOFactory replaces newDAOFn with one that returns the supplied
// MockDAO. Returns a cleanup func.
func installMockDAOFactory(t *testing.T, dao *daos.MockDAO) func() {
	t.Helper()
	orig := newDAOFn
	newDAOFn = func(_ context.Context, _ daos.Options) (daos.DaoInterface, error) {
		return dao, nil
	}
	return func() { newDAOFn = orig }
}

func TestStripeWebhookEndpoint_FullFlow(t *testing.T) {
	const secret = "whsec_test_full_flow"

	t.Run("unsubscribed event types are ACKed without DAO mutation", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) {
			t.Fatalf("DAO should not be touched for non-subscription events")
			return "", nil
		}
		t.Cleanup(installMockDAOFactory(t, dao))
		t.Setenv("STRIPE_WEBHOOK_SECRET", secret)

		payload := []byte(`{"id":"evt_test_other","type":"customer.created","data":{"object":{}}}`)
		rec := httptest.NewRecorder()
		StripeWebhookEndpoint(rec, signedWebhookReq(t, payload, secret))

		if rec.Code != http.StatusOK {
			t.Fatalf("status %d, want 200", rec.Code)
		}
	})

	t.Run("customer.subscription.created promotes a user end-to-end", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		var savedSub models.Subscription
		dao.MockUpdateSubscription = func(s models.Subscription) error { savedSub = s; return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: false}, nil
		}
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) { return false, nil }
		var savedUser models.UserInfo
		dao.MockUpdateUser = func(u models.UserInfo) error { savedUser = u; return nil }

		t.Cleanup(installMockDAOFactory(t, dao))
		t.Setenv("STRIPE_WEBHOOK_SECRET", secret)

		periodEnd := time.Now().Add(30 * 24 * time.Hour).Unix()
		payload := subscriptionEventPayload(
			t,
			"customer.subscription.created",
			"sub_777",
			"cus_777",
			"active",
			periodEnd,
		)

		rec := httptest.NewRecorder()
		StripeWebhookEndpoint(rec, signedWebhookReq(t, payload, secret))

		if rec.Code != http.StatusOK {
			t.Fatalf("status %d, want 200 (body=%s)", rec.Code, rec.Body.String())
		}
		if savedSub.SubscriptionID != "sub_777" {
			t.Errorf("subscription id: got %q, want sub_777", savedSub.SubscriptionID)
		}
		if !savedUser.Subscriber {
			t.Errorf("user.Subscriber: want true after promotion")
		}
	})

	t.Run("customer.subscription.deleted demotes a user end-to-end", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: true}, nil
		}
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{{ID: "only"}}, nil // 1 story → none soft-deleted
		}
		var savedUser models.UserInfo
		dao.MockUpdateUser = func(u models.UserInfo) error { savedUser = u; return nil }
		var (
			alertMu sync.Mutex
			alerts  []models.Alert
		)
		dao.MockCreateAlert = func(a models.Alert) error {
			alertMu.Lock()
			alerts = append(alerts, a)
			alertMu.Unlock()
			return nil
		}

		t.Cleanup(installMockDAOFactory(t, dao))
		t.Setenv("STRIPE_WEBHOOK_SECRET", secret)

		payload := subscriptionEventPayload(t, "customer.subscription.deleted", "sub_777", "cus_777", "canceled", 0)

		rec := httptest.NewRecorder()
		StripeWebhookEndpoint(rec, signedWebhookReq(t, payload, secret))

		if rec.Code != http.StatusOK {
			t.Fatalf("status %d, want 200", rec.Code)
		}
		if savedUser.Subscriber {
			t.Errorf("user.Subscriber: want false after demotion")
		}
		if savedUser.NotifyExpired {
			t.Errorf("user.NotifyExpired: want false (alert is fired directly by webhook path)")
		}

		// fireSubscriptionExpiredAlert spawns CreateAlert in a goroutine.
		alertDeadline := time.Now().Add(time.Second)
		for time.Now().Before(alertDeadline) {
			alertMu.Lock()
			done := len(alerts) == 1
			alertMu.Unlock()
			if done {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}
		alertMu.Lock()
		defer alertMu.Unlock()
		if len(alerts) != 1 {
			t.Fatalf("expected 1 subscription-expired alert, got %d", len(alerts))
		}
		if got, want := alerts[0].ID, "sub-expired-a@x.com"; got != want {
			t.Errorf("alert ID: got %q, want %q", got, want)
		}
	})

	t.Run("unknown customer ID returns 400 from inside the subscription handler", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "", nil }

		t.Cleanup(installMockDAOFactory(t, dao))
		t.Setenv("STRIPE_WEBHOOK_SECRET", secret)

		payload := subscriptionEventPayload(
			t,
			"customer.subscription.updated",
			"sub_x",
			"cus_unknown",
			"active",
			time.Now().Unix(),
		)

		rec := httptest.NewRecorder()
		StripeWebhookEndpoint(rec, signedWebhookReq(t, payload, secret))

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status %d, want 400 (body=%s)", rec.Code, rec.Body.String())
		}
	})
}
