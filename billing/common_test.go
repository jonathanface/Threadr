package billing

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"strings"
	"testing"

	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
)

// ---- Helpers to stub Stripe API via httptest server ----

func newStripeServer(t *testing.T, spec stripeRouteSpec) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	// Customers
	handleCustomers := func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet: // list
			email := r.URL.Query().Get("email")
			resp := map[string]any{"object": "list", "data": []any{}, "has_more": false, "url": "/v1/customers"}
			if spec.ExistingCustomerID != "" {
				resp["data"] = []any{
					map[string]any{"id": spec.ExistingCustomerID, "object": "customer", "email": email},
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
		case http.MethodPost: // create
			if spec.CreateShouldError {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":{"message":"bad create"}}`))
				return
			}
			id := spec.CreateCustomerID
			if id == "" {
				id = "cus_new_default"
			}
			resp := map[string]any{"id": id, "object": "customer"}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
		default:
			http.NotFound(w, r)
		}
	}
	mux.HandleFunc("/v1/customers", handleCustomers)
	mux.HandleFunc("/v1/customers/", handleCustomers)

	// Subscriptions
	handleSubscriptions := func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			// Distinguish list vs get-by-id
			if r.URL.Path == "/v1/subscriptions" || r.URL.Path == "/v1/subscriptions/" {
				// LIST
				resp := map[string]any{"object": "list", "data": []any{}, "has_more": false, "url": "/v1/subscriptions"}
				if spec.ListSubStatus != "" {
					item := map[string]any{
						"id":                   "sub_list_123",
						"object":               "subscription",
						"status":               spec.ListSubStatus,
						"cancel_at_period_end": spec.ListSubCancelAtPeriodEnd,
					}
					if spec.ListSubCurrentPeriodEnd > 0 {
						item["current_period_end"] = spec.ListSubCurrentPeriodEnd
					}
					resp["data"] = []any{item}
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(resp)
				return
			}

			// GET BY ID: /v1/subscriptions/{id}
			id := path.Base(r.URL.Path)
			if spec.GetSubID == "" || id != spec.GetSubID {
				w.WriteHeader(http.StatusNotFound)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"error":{"message":"not found"}}`))
				return
			}
			sub := map[string]any{
				"id":                   spec.GetSubID,
				"object":               "subscription",
				"status":               spec.GetSubStatus,
				"cancel_at_period_end": spec.GetSubCancelAtPeriodEnd,
			}
			if spec.GetSubCurrentPeriodEnd > 0 {
				sub["current_period_end"] = spec.GetSubCurrentPeriodEnd
			}
			// If you want endpoint to read Customer.ID, include an expanded customer
			if spec.GetSubCustomerID != "" {
				sub["customer"] = map[string]any{"id": spec.GetSubCustomerID, "object": "customer"}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(sub)
			return

		case http.MethodPost: // create
			if spec.CreateSubShouldError {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":{"message":"sub create failed"}}`))
				return
			}
			id := spec.CreateSubID
			if id == "" {
				id = "sub_new_123"
			}
			var latestInvoice any
			if !spec.CreateSubNoPI {
				latestInvoice = map[string]any{
					"id": "in_123",
					"payment_intent": map[string]any{
						"id":            "pi_123",
						"client_secret": "pi_123_secret_abc",
					},
				}
			} else {
				latestInvoice = map[string]any{"id": "in_123"} // no payment_intent
			}
			resp := map[string]any{
				"id":             id,
				"object":         "subscription",
				"latest_invoice": latestInvoice,
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
		default:
			http.NotFound(w, r)
		}
	}
	mux.HandleFunc("/v1/subscriptions", handleSubscriptions)
	mux.HandleFunc("/v1/subscriptions/", handleSubscriptions)

	// Billing portal session
	mux.HandleFunc("/v1/billing_portal/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if spec.PortalShouldError {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"portal failed"}}`))
			return
		}
		url := spec.PortalURL
		if url == "" {
			url = "https://stripe.test/portal/xyz"
		}
		resp := map[string]any{"id": "bps_123", "url": url}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	return httptest.NewServer(mux)
}

// func newStripeServer(t *testing.T, spec stripeRouteSpec) *httptest.Server {
// 	t.Helper()

// 	mux := http.NewServeMux()

// 	handleCustomers := func(w http.ResponseWriter, r *http.Request) {
// 		switch r.Method {
// 		case http.MethodGet: // List
// 			email := r.URL.Query().Get("email")
// 			resp := map[string]any{
// 				"object":   "list",
// 				"data":     []any{},
// 				"has_more": false,
// 				"url":      "/v1/customers",
// 			}
// 			if spec.ExistingCustomerID != "" {
// 				resp["data"] = []any{
// 					map[string]any{
// 						"id":     spec.ExistingCustomerID,
// 						"object": "customer",
// 						"email":  email,
// 					},
// 				}
// 			}
// 			w.Header().Set("Content-Type", "application/json")
// 			_ = json.NewEncoder(w).Encode(resp)

// 		case http.MethodPost: // Create
// 			if spec.CreateShouldError {
// 				w.WriteHeader(http.StatusBadRequest)
// 				_, _ = w.Write([]byte(`{"error":{"message":"bad create"}}`))
// 				return
// 			}
// 			id := spec.CreateCustomerID
// 			if id == "" {
// 				id = "cus_new_default"
// 			}
// 			resp := map[string]any{
// 				"id":     id,
// 				"object": "customer",
// 			}
// 			w.Header().Set("Content-Type", "application/json")
// 			_ = json.NewEncoder(w).Encode(resp)

// 		default:
// 			http.NotFound(w, r)
// 		}
// 	}

// 	// Support both with/without trailing slash (Stripe may hit either)
// 	mux.HandleFunc("/v1/customers", handleCustomers)
// 	mux.HandleFunc("/v1/customers/", handleCustomers)

// 	return httptest.NewServer(mux)
// }

// func setStripeBackendToServer(t *testing.T, srv *httptest.Server) func() {
// 	t.Helper()

// 	// Any non-empty key; library just checks presence for auth.
// 	stripe.Key = "sk_test_123"

// 	orig := stripe.GetBackend(stripe.APIBackend)

// 	// Use the library helper to build a concrete backend with our server config.
// 	backend := stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{
// 		URL:        &srv.URL,
// 		HTTPClient: srv.Client(),
// 	})

// 	stripe.SetBackend(stripe.APIBackend, backend)

// 	// (Uploads backend not needed here; call SetBackend for it too if you ever hit file endpoints.)
// 	return func() {
// 		stripe.SetBackend(stripe.APIBackend, orig)
// 	}
// }

func setStripeBackendToServer(t *testing.T, srv *httptest.Server) func() {
	t.Helper()
	stripe.Key = "sk_test_123"

	orig := stripe.GetBackend(stripe.APIBackend)
	backend := stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{
		URL:        &srv.URL,
		HTTPClient: srv.Client(),
	})
	stripe.SetBackend(stripe.APIBackend, backend)
	return func() { stripe.SetBackend(stripe.APIBackend, orig) }
}

// ---- Tests: ensureCustomer ----

func TestEnsureCustomer(t *testing.T) {
	type tc struct {
		name    string
		user    models.UserInfo
		sub     models.Subscription
		spec    stripeRouteSpec
		wantID  string
		wantErr bool
	}

	cases := []tc{
		{
			name:   "has existing CustomerID on user – returns it, no Stripe calls required",
			user:   models.UserInfo{Email: "a@example.com"},
			sub:    models.Subscription{Email: "c@example.com", CustomerID: "cus_from_user"},
			spec:   stripeRouteSpec{}, // should be ignored
			wantID: "cus_from_user",
		},
		{
			name:   "no CustomerID, list finds existing customer",
			user:   models.UserInfo{Email: "b@example.com"},
			sub:    models.Subscription{Email: "c@example.com"},
			spec:   stripeRouteSpec{ExistingCustomerID: "cus_list_hit"},
			wantID: "cus_list_hit",
		},
		{
			name:   "no CustomerID, list empty → creates new",
			user:   models.UserInfo{Email: "c@example.com"},
			sub:    models.Subscription{Email: "c@example.com"},
			spec:   stripeRouteSpec{CreateCustomerID: "cus_created"},
			wantID: "cus_created",
		},
		{
			name:    "create error → function returns error",
			user:    models.UserInfo{Email: "d@example.com"},
			sub:     models.Subscription{Email: "c@example.com"},
			spec:    stripeRouteSpec{CreateShouldError: true},
			wantErr: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Suppress Stripe SDK error logs for test cases expecting errors
			if c.spec.CreateShouldError {
				origStderr := os.Stderr
				os.Stderr, _ = os.Open(os.DevNull)
				defer func() { os.Stderr = origStderr }()
			}

			// If the user already has a CustomerID, we don't need a server; but setting one is harmless.
			srv := newStripeServer(t, c.spec)
			defer srv.Close()
			restore := setStripeBackendToServer(t, srv)
			defer restore()

			got, err := ensureCustomer(&c.user, &c.sub)

			if c.wantErr {
				if err == nil {
					t.Fatalf("expected error, got none")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != c.wantID {
				t.Fatalf("got %q, want %q", got, c.wantID)
			}
		})
	}
}

// ---- Tests: RespondWithJson / RespondWithError ----

func TestRespondWithJson_and_Error(t *testing.T) {
	type tc struct {
		name     string
		code     int
		payload  any
		wantJSON string // subset match; we normalize whitespace
		useError bool   // if true, call RespondWithError instead
	}

	cases := []tc{
		{
			name:     "simple map 200",
			code:     http.StatusOK,
			payload:  map[string]string{"ok": "true"},
			wantJSON: `{"ok":"true"}`,
		},
		{
			name:     "struct 201",
			code:     http.StatusCreated,
			payload:  struct{ A int }{A: 5},
			wantJSON: `{"A":5}`,
		},
		{
			name:     "RespondWithError wraps message",
			code:     http.StatusBadRequest,
			payload:  "ignored",
			wantJSON: `{"error":"bad things happened"}`,
			useError: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			if c.useError {
				RespondWithError(rec, c.code, "bad things happened")
			} else {
				RespondWithJson(rec, c.code, c.payload)
			}

			res := rec.Result()
			defer res.Body.Close()

			if got := res.StatusCode; got != c.code {
				t.Fatalf("status %d, want %d", got, c.code)
			}
			ct := res.Header.Get("Content-Type")
			if !strings.Contains(ct, "application/json") {
				t.Fatalf("content-type %q, want application/json", ct)
			}

			body, _ := io.ReadAll(res.Body)
			got := compactJSON(body)
			want := compactJSON([]byte(c.wantJSON))
			if got != want {
				t.Fatalf("body mismatch\ngot:  %s\nwant: %s", got, want)
			}
		})
	}
}

func compactJSON(b []byte) string {
	var buf bytes.Buffer
	if err := json.Compact(&buf, b); err != nil {
		return string(b)
	}
	return buf.String()
}
