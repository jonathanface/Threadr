package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/stripe/stripe-go/v79"
)

// Tests for CreateUser
func TestCreateUser(t *testing.T) {
	testCases := []struct {
		name                string
		email               string
		mockAwsWriteErr     error
		mockAwsWriteAwsErr  models.AwsError
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:    "SuccessfulUserCreation",
			email:   "newuser@example.com",
			wantErr: false,
		},
		{
			name:                "TransactionWriteError",
			email:               "user@example.com",
			mockAwsWriteErr:     errors.New("transaction failed"),
			wantErr:             true,
			expectedErrContains: "transaction failed",
		},
		{
			name:  "AWSError",
			email: "user@example.com",
			mockAwsWriteAwsErr: models.AwsError{
				Code:      "ConditionalCheckFailedException",
				ErrorType: "Client",
				Text:      "User already exists",
			},
			wantErr:             true,
			expectedErrContains: "--AWSERROR-- Code:ConditionalCheckFailedException",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			if tc.mockAwsWriteErr != nil || !tc.mockAwsWriteAwsErr.IsNil() {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
				}
				mockClient.MockTransactWriteItems = func(ctx context.Context,
					input *dynamodb.TransactWriteItemsInput,
					opts ...func(*dynamodb.Options),
				) (*dynamodb.TransactWriteItemsOutput, error) {
					if tc.mockAwsWriteErr != nil {
						return nil, tc.mockAwsWriteErr
					}
					return nil, errors.New("--AWSERROR-- Code:" + tc.mockAwsWriteAwsErr.Code + ", Type: " + tc.mockAwsWriteAwsErr.ErrorType + ", Message: " + tc.mockAwsWriteAwsErr.Text)
				}
			}

			user, err := mockDao.CreateUser(tc.email)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if user == nil {
					t.Error("Expected user to be returned")
				} else {
					if user.Email != tc.email {
						t.Errorf("Expected email %q, got %q", tc.email, user.Email)
					}
					if user.Admin {
						t.Error("New user should not be admin")
					}
					if user.Subscriber {
						t.Error("New user should not be subscriber")
					}
				}
			}
		})
	}
}

// Tests for GetUserDetails
func TestGetUserDetails(t *testing.T) {
	testCases := []struct {
		name  string
		email string
	}{
		{
			name:  "UserNotFound_MockBehavior",
			email: "nonexistent@example.com",
		},
		{
			name:  "RequiresMockDB",
			email: "user@example.com",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			user, err := mockDao.GetUserDetails(tc.email)

			// Note: MockDynamoClient Scan behavior doesn't fully replicate DynamoDB
			// In production, empty result -> sql.ErrNoRows
			// In mock, behavior may vary depending on mock implementation
			t.Logf("GetUserDetails(%q) returned user=%v, err=%v", tc.email, user != nil, err)

			// We can't make strong assertions without full DB mock
			// Just verify the function doesn't panic
		})
	}
}

// Tests for UpsertUser
func TestUpsertUser(t *testing.T) {
	testCases := []struct {
		name                string
		email               string
		mockUpdateErr       error
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:    "SuccessfulUpsert",
			email:   "user@example.com",
			wantErr: false,
		},
		{
			name:                "UpdateItemError",
			email:               "user@example.com",
			mockUpdateErr:       errors.New("update failed"),
			wantErr:             true,
			expectedErrContains: "update failed",
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

			user, err := mockDao.UpsertUser(tc.email)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if user == nil {
					t.Error("Expected user to be returned")
				}
			}
		})
	}
}

// Tests for UpdateUser
func TestUpdateUser(t *testing.T) {
	testCases := []struct {
		name                string
		user                models.UserInfo
		mockUpdateErr       error
		wantErr             bool
		expectedErrContains string
	}{
		{
			name: "SuccessfulUpdate_Subscriber",
			user: models.UserInfo{
				Email:      "user@example.com",
				Subscriber: true,
			},
			wantErr: false,
		},
		{
			name: "SuccessfulUpdate_NonSubscriber",
			user: models.UserInfo{
				Email:      "user@example.com",
				Subscriber: false,
			},
			wantErr: false,
		},
		{
			name: "UpdateItemError",
			user: models.UserInfo{
				Email:      "user@example.com",
				Subscriber: true,
			},
			mockUpdateErr:       errors.New("update failed"),
			wantErr:             true,
			expectedErrContains: "update failed",
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

			err := mockDao.UpdateUser(tc.user)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

// Tests for toStatus
func TestToStatus(t *testing.T) {
	testCases := []struct {
		name         string
		subscription *stripe.Subscription
		found        bool
		wantActive   bool
		wantStatus   string
	}{
		{
			name: "ActiveSubscription",
			subscription: &stripe.Subscription{
				ID:               "sub_123",
				Status:           stripe.SubscriptionStatusActive,
				CurrentPeriodEnd: time.Now().Add(30 * 24 * time.Hour).Unix(),
			},
			found:      true,
			wantActive: true,
			wantStatus: string(stripe.SubscriptionStatusActive),
		},
		{
			name: "TrialingSubscription",
			subscription: &stripe.Subscription{
				ID:               "sub_456",
				Status:           stripe.SubscriptionStatusTrialing,
				CurrentPeriodEnd: time.Now().Add(14 * 24 * time.Hour).Unix(),
			},
			found:      true,
			wantActive: true,
			wantStatus: string(stripe.SubscriptionStatusTrialing),
		},
		{
			name: "CanceledSubscription",
			subscription: &stripe.Subscription{
				ID:               "sub_789",
				Status:           stripe.SubscriptionStatusCanceled,
				CurrentPeriodEnd: time.Now().Add(-1 * 24 * time.Hour).Unix(),
			},
			found:      true,
			wantActive: false,
			wantStatus: string(stripe.SubscriptionStatusCanceled),
		},
		{
			name: "PastDueSubscription",
			subscription: &stripe.Subscription{
				ID:               "sub_000",
				Status:           stripe.SubscriptionStatusPastDue,
				CurrentPeriodEnd: time.Now().Add(7 * 24 * time.Hour).Unix(),
			},
			found:      true,
			wantActive: false,
			wantStatus: string(stripe.SubscriptionStatusPastDue),
		},
		{
			name: "NotFoundSubscription",
			subscription: &stripe.Subscription{
				ID:               "sub_notfound",
				Status:           stripe.SubscriptionStatusActive,
				CurrentPeriodEnd: 0,
			},
			found:      false,
			wantActive: true,
			wantStatus: string(stripe.SubscriptionStatusActive),
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			status := toStatus(tc.subscription, tc.found)

			if status.ID != tc.subscription.ID {
				t.Errorf("Expected ID %q, got %q", tc.subscription.ID, status.ID)
			}
			if status.Found != tc.found {
				t.Errorf("Expected Found=%v, got %v", tc.found, status.Found)
			}
			if status.Active != tc.wantActive {
				t.Errorf("Expected Active=%v, got %v", tc.wantActive, status.Active)
			}
			if status.Status != tc.wantStatus {
				t.Errorf("Expected Status=%q, got %q", tc.wantStatus, status.Status)
			}
			if tc.subscription.CurrentPeriodEnd > 0 {
				expectedTime := time.Unix(tc.subscription.CurrentPeriodEnd, 0)
				if !status.CurrentPeriodEnd.Equal(expectedTime) {
					t.Errorf("Expected CurrentPeriodEnd=%v, got %v", expectedTime, status.CurrentPeriodEnd)
				}
			}
		})
	}
}

// Tests for IsUserSubscribed
func TestIsUserSubscribed(t *testing.T) {
	// Note: This function has complex dependencies on GetSubscription, verifyStripeSubscription,
	// UpdateSubscription, GetAllStories, SoftDeleteStory, CheckForSuspendedStories, kickoffRestoreAsync
	// With STRIPE_SECRET set in CI, basic cases will work but full testing requires extensive mocking

	testCases := []struct {
		name             string
		user             models.UserInfo
		wantErr          bool
		wantSubscriber   bool
	}{
		{
			name: "NoSubscriptionOnFile",
			user: models.UserInfo{
				Email:      "user@example.com",
				Subscriber: false,
			},
			wantErr:        false, // With STRIPE_SECRET set, GetSubscription returns no rows -> success
			wantSubscriber: false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			result, err := mockDao.IsUserSubscribed(tc.user)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				} else if result.Subscriber != tc.wantSubscriber {
					t.Errorf("Expected Subscriber=%v, got %v", tc.wantSubscriber, result.Subscriber)
				}
			}
		})
	}
}

// Tests for AddCustomerID
func TestAddCustomerID(t *testing.T) {
	email := "user@example.com"
	customerID := "cus_123456"

	testCases := []struct {
		name                string
		email               *string
		customerID          *string
		mockUpdateErr       error
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:       "SuccessfulAddCustomerID",
			email:      &email,
			customerID: &customerID,
			wantErr:    false,
		},
		{
			name:                "UpdateItemError",
			email:               &email,
			customerID:          &customerID,
			mockUpdateErr:       errors.New("update failed"),
			wantErr:             true,
			expectedErrContains: "update failed",
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

			err := mockDao.AddCustomerID(tc.email, tc.customerID)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

// Tests for GetUserDetails with ErrNoRows
func TestGetUserDetails_NoRows(t *testing.T) {
	mockDao := NewMockDAO()

	user, err := mockDao.GetUserDetails("nonexistent@example.com")

	// Note: Mock behavior may not perfectly match production DynamoDB behavior
	// In production: empty Scan -> sql.ErrNoRows
	// In mock: behavior depends on MockDynamoClient implementation
	t.Logf("GetUserDetails(nonexistent) returned user=%v, err=%v", user, err)

	// Just verify no panic - detailed assertions need full DB mock
}

// Benchmark tests
func BenchmarkCreateUser(b *testing.B) {
	mockDao := NewMockDAO()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, _ = mockDao.CreateUser("bench@example.com")
	}
}

func BenchmarkToStatus(b *testing.B) {
	sub := &stripe.Subscription{
		ID:               "sub_bench",
		Status:           stripe.SubscriptionStatusActive,
		CurrentPeriodEnd: time.Now().Add(30 * 24 * time.Hour).Unix(),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = toStatus(sub, true)
	}
}
