package sessions

import (
	"testing"
	"time"
)

func TestTokenExpiry(t *testing.T) {
	t.Run("new token is retrievable", func(t *testing.T) {
		token := GenerateSessionToken()
		StoreTokenMapping(token, "user@test.com")

		val, ok := GetUserByToken(token)
		if !ok {
			t.Fatal("Expected token to be found")
		}
		if val != "user@test.com" {
			t.Errorf("Expected 'user@test.com', got '%v'", val)
		}

		// Clean up
		DeleteTokenMapping(token)
	})

	t.Run("expired token is rejected and removed", func(t *testing.T) {
		token := GenerateSessionToken()
		// Store with an already-expired time
		defaultStore.m.Store(token, &tokenData{
			UserInfo:  "expired@test.com",
			ExpiresAt: time.Now().Add(-1 * time.Hour),
		})

		val, ok := GetUserByToken(token)
		if ok {
			t.Errorf("Expected expired token to be rejected, got: %v", val)
		}

		// Verify it was cleaned up
		_, exists := defaultStore.m.Load(token)
		if exists {
			t.Error("Expected expired token to be removed from map")
		}
	})

	t.Run("token near expiry still works", func(t *testing.T) {
		token := GenerateSessionToken()
		defaultStore.m.Store(token, &tokenData{
			UserInfo:  "valid@test.com",
			ExpiresAt: time.Now().Add(1 * time.Minute),
		})

		_, ok := GetUserByToken(token)
		if !ok {
			t.Fatal("Expected near-expiry token to still be valid")
		}

		DeleteTokenMapping(token)
	})

	t.Run("deleted token is not retrievable", func(t *testing.T) {
		token := GenerateSessionToken()
		StoreTokenMapping(token, "delete@test.com")
		DeleteTokenMapping(token)

		_, ok := GetUserByToken(token)
		if ok {
			t.Error("Expected deleted token to not be found")
		}
	})

	t.Run("StoreTokenMapping sets 30-day expiry", func(t *testing.T) {
		token := GenerateSessionToken()
		StoreTokenMapping(token, "user@test.com")

		val, _ := defaultStore.m.Load(token)
		data := val.(*tokenData)

		expectedExpiry := time.Now().Add(30 * 24 * time.Hour)
		diff := data.ExpiresAt.Sub(expectedExpiry)
		if diff > time.Second || diff < -time.Second {
			t.Errorf("Expected ~30 day expiry, got diff of %v", diff)
		}

		DeleteTokenMapping(token)
	})
}
