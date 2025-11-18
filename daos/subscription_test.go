package daos

import (
	"testing"
)

// Tests for GetSubscription
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
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			sub, err := mockDao.GetSubscription(tc.email)

			t.Logf("GetSubscription(%q) returned sub=%v, err=%v", tc.email, sub != nil, err)
		})
	}
}

// Tests for GetEmailByCustomerId
func TestGetEmailByCustomerId(t *testing.T) {
	testCases := []struct {
		name     string
		customerID string
	}{
		{
			name:       "ValidCustomerID_RequiresMockDB",
			customerID: "cus_123456",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			email, err := mockDao.GetEmailByCustomerId(tc.customerID)

			t.Logf("GetEmailByCustomerId(%q) returned email=%q, err=%v", tc.customerID, email, err)
		})
	}
}

// Benchmark tests
func BenchmarkGetSubscription(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = mockDao.GetSubscription("bench@example.com")
	}
}

