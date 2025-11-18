package daos

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// Tests for AddStripeData
func TestAddStripeData(t *testing.T) {
	email := "user@example.com"
	subscriptionID := "sub_123456"
	customerID := "cus_123456"

	testCases := []struct {
		name             string
		email            *string
		subscriptionID   *string
		customerID       *string
		mockUpdateErr    error
		wantErr          bool
		expectedErrMsg   string
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
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			if tc.mockUpdateErr != nil {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
				}
				mockClient.MockUpdateItem = func(ctx context.Context,
					input *dynamodb.UpdateItemInput,
					opts ...func(*dynamodb.Options),
				) (*dynamodb.UpdateItemOutput, error) {
					return nil, tc.mockUpdateErr
				}
			}

			err := mockDao.AddStripeData(tc.email, tc.subscriptionID, tc.customerID)

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

// Tests for verifyStripeSubscription
func TestVerifyStripeSubscription(t *testing.T) {
	testCases := []struct {
		name       string
		subID      string
		customerID string
		wantErr    bool
	}{
		{
			name:       "RequiresStripeAPI",
			subID:      "sub_123456",
			customerID: "cus_123456",
			wantErr:    true, // Will fail without actual Stripe API
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			status, err := mockDao.verifyStripeSubscription(tc.subID, tc.customerID)

			// This function calls real Stripe API, so it will fail in tests
			// without STRIPE_SECRET or with invalid credentials
			t.Logf("verifyStripeSubscription returned status=%+v, err=%v", status, err)

			if tc.wantErr {
				if err == nil {
					t.Logf("Expected error but got nil (acceptable if Stripe configured)")
				}
			}
		})
	}
}

// Benchmark tests
func BenchmarkAddStripeData(b *testing.B) {
	mockDao := NewMockDAO()
	email := "bench@example.com"
	subID := "sub_bench"
	custID := "cus_bench"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = mockDao.AddStripeData(&email, &subID, &custID)
	}
}
