package daos

import (
	"context"
	"errors"
	"testing"
	"time"

	"Threadr/models"
)

// Tests for GetSubscription.
func TestGetSubscription(t *testing.T) {
	testCases := []struct {
		name  string
		email string
	}{
		{
			name:  "ValidEmail_RequiresMockDB",
			email: "user@example.com",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			sub, err := mockDao.GetSubscription(context.Background(), tc.email)

			t.Logf("GetSubscription(%q) returned sub=%v, err=%v", tc.email, sub != nil, err)
		})
	}
}

// Tests for GetEmailByCustomerID.
func TestGetEmailByCustomerID(t *testing.T) {
	testCases := []struct {
		name       string
		customerID string
	}{
		{
			name:       "ValidCustomerID_RequiresMockDB",
			customerID: "cus_123456",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			email, err := mockDao.GetEmailByCustomerID(context.Background(), tc.customerID)

			t.Logf("GetEmailByCustomerID(%q) returned email=%q, err=%v", tc.customerID, email, err)
		})
	}
}

// Tests for UpdateSubscription.
func TestUpdateSubscription(t *testing.T) {
	now := time.Now()
	futureTime := now.Add(30 * 24 * time.Hour) // 30 days from now

	testCases := []struct {
		name         string
		subscription models.Subscription
		mockErr      error
		wantErr      bool
		errContains  string
	}{
		{
			name: "SuccessfulUpdate_AllFields",
			subscription: models.Subscription{
				Email:                  "user@example.com",
				SubscriptionID:         "sub_123456",
				CustomerID:             "cus_123456",
				LastSubCheck:           now,
				CurrentSubscriptionEnd: futureTime,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "SuccessfulUpdate_NoCustomerID",
			subscription: models.Subscription{
				Email:                  "user@example.com",
				SubscriptionID:         "sub_789012",
				LastSubCheck:           now,
				CurrentSubscriptionEnd: futureTime,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "SuccessfulUpdate_NoSubscriptionEnd",
			subscription: models.Subscription{
				Email:          "user@example.com",
				SubscriptionID: "sub_345678",
				CustomerID:     "cus_345678",
				LastSubCheck:   now,
			},
			mockErr: nil,
			wantErr: false,
		},
		{
			name: "EmptyEmail_Error",
			subscription: models.Subscription{
				Email:          "",
				SubscriptionID: "sub_999999",
				LastSubCheck:   now,
			},
			mockErr:     errors.New("UpdateSubscription: email is required"),
			wantErr:     true,
			errContains: "email is required",
		},
		{
			name: "DatabaseError",
			subscription: models.Subscription{
				Email:          "user@example.com",
				SubscriptionID: "sub_000000",
				CustomerID:     "cus_000000",
				LastSubCheck:   now,
			},
			mockErr: errors.New("database update failed"),
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			mockDao.MockUpdateSubscription = func(sub models.Subscription) error {
				if tc.subscription.Email != "" && sub.Email != tc.subscription.Email {
					t.Errorf("Expected email %s, got %s", tc.subscription.Email, sub.Email)
				}
				if sub.SubscriptionID != tc.subscription.SubscriptionID {
					t.Errorf("Expected subscription ID %s, got %s", tc.subscription.SubscriptionID, sub.SubscriptionID)
				}
				if tc.subscription.CustomerID != "" && sub.CustomerID != tc.subscription.CustomerID {
					t.Errorf("Expected customer ID %s, got %s", tc.subscription.CustomerID, sub.CustomerID)
				}
				if !sub.LastSubCheck.Equal(tc.subscription.LastSubCheck) {
					t.Errorf("Expected LastSubCheck %v, got %v", tc.subscription.LastSubCheck, sub.LastSubCheck)
				}
				if !tc.subscription.CurrentSubscriptionEnd.IsZero() &&
					!sub.CurrentSubscriptionEnd.Equal(tc.subscription.CurrentSubscriptionEnd) {
					t.Errorf("Expected CurrentSubscriptionEnd %v, got %v",
						tc.subscription.CurrentSubscriptionEnd, sub.CurrentSubscriptionEnd)
				}
				return tc.mockErr
			}

			err := mockDao.UpdateSubscription(context.Background(), tc.subscription)

			if tc.wantErr {
				assertExpectedErr(t, err, tc.errContains)
			} else if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// Benchmark tests.
func BenchmarkGetSubscription(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.GetSubscription(context.Background(), "bench@example.com")
	}
}
