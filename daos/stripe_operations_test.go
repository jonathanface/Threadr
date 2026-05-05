package daos

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/stripe/stripe-go/v79"
)

// Tests for AddStripeData.
func TestAddStripeData(t *testing.T) {
	email := "user@example.com"
	subscriptionID := "sub_123456"
	customerID := "cus_123456"

	testCases := []struct {
		name           string
		email          *string
		subscriptionID *string
		customerID     *string
		mockUpdateErr  error
		wantErr        bool
		expectedErrMsg string
	}{
		{
			name:           "SuccessfulAdd_AllData",
			email:          &email,
			subscriptionID: &subscriptionID,
			customerID:     &customerID,
			wantErr:        false,
		},
		{
			name:           "UpdateItemError",
			email:          &email,
			subscriptionID: &subscriptionID,
			customerID:     &customerID,
			mockUpdateErr:  errors.New("update failed"),
			wantErr:        true,
			expectedErrMsg: "update failed",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			if tc.mockUpdateErr != nil {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
				}
				mockClient.MockUpdateItem = func(_ context.Context,
					_ *dynamodb.UpdateItemInput,
					_ ...func(*dynamodb.Options),
				) (*dynamodb.UpdateItemOutput, error) {
					return nil, tc.mockUpdateErr
				}
			}

			err := mockDao.AddStripeData(context.Background(), tc.email, tc.subscriptionID, tc.customerID)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrMsg != "" && !contains(err.Error(), tc.expectedErrMsg) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

// Tests for verifyStripeSubscription.
func TestVerifyStripeSubscription(t *testing.T) {
	// Suppress Stripe SDK error logs to stderr (expected errors in tests)
	origStderr := os.Stderr
	os.Stderr, _ = os.Open(os.DevNull)
	defer func() { os.Stderr = origStderr }()

	// Also suppress standard log output from Stripe
	origLogOutput := log.Writer()
	log.SetOutput(io.Discard)
	defer log.SetOutput(origLogOutput)

	testCases := []struct {
		name        string
		subID       string
		customerID  string
		mockHandler http.HandlerFunc
		wantErr     bool
		wantFound   bool
		wantActive  bool
	}{
		{
			name:       "SubscriptionFoundByID",
			subID:      "sub_123456",
			customerID: "cus_123456",
			mockHandler: func(w http.ResponseWriter, _ *http.Request) {
				// Mock successful subscription GET response
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{
					"id": "sub_123456",
					"status": "active",
					"current_period_end": 1735344000
				}`))
			},
			wantErr:    false,
			wantFound:  true,
			wantActive: true,
		},
		{
			name:       "SubscriptionNotFound",
			subID:      "sub_missing",
			customerID: "cus_123456",
			mockHandler: func(w http.ResponseWriter, r *http.Request) {
				// Handle both subscription GET by ID and LIST by customer
				switch r.URL.Path {
				case "/v1/subscriptions/sub_missing":
					// Mock 404 subscription not found by ID
					w.WriteHeader(http.StatusNotFound)
					w.Write([]byte(`{
						"error": {
							"type": "invalid_request_error",
							"code": "resource_missing",
							"param": "id",
							"message": "No such subscription"
						}
					}`))
				case "/v1/subscriptions":
					// Mock empty subscription list for customer
					w.WriteHeader(http.StatusOK)
					w.Write([]byte(`{
						"object": "list",
						"data": [],
						"has_more": false
					}`))
				default:
					w.WriteHeader(http.StatusNotFound)
				}
			},
			wantErr:    false,
			wantFound:  false,
			wantActive: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Set up mock Stripe server
			srv := httptest.NewServer(tc.mockHandler)
			defer srv.Close()

			// Configure Stripe to use mock backend
			stripe.Key = "sk_test_123"
			origBackend := stripe.GetBackend(stripe.APIBackend)
			defer stripe.SetBackend(stripe.APIBackend, origBackend)

			backend := stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{
				URL:        &srv.URL,
				HTTPClient: srv.Client(),
			})
			stripe.SetBackend(stripe.APIBackend, backend)

			mockDao := NewMockDAO()
			status, err := mockDao.verifyStripeSubscription(tc.subID, tc.customerID)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if status.Found != tc.wantFound {
					t.Errorf("Expected Found=%v, got %v", tc.wantFound, status.Found)
				}
				if status.Active != tc.wantActive {
					t.Errorf("Expected Active=%v, got %v", tc.wantActive, status.Active)
				}
			}
		})
	}
}

// Benchmark tests.
func BenchmarkAddStripeData(b *testing.B) {
	mockDao := NewMockDAO()
	email := "bench@example.com"
	subID := "sub_bench"
	custID := "cus_bench"

	b.ResetTimer()
	for range b.N {
		_ = mockDao.AddStripeData(context.Background(), &email, &subID, &custID)
	}
}
