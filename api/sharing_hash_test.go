package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/gorilla/mux"
)

func TestHashShareToken(t *testing.T) {
	t.Run("returns consistent hash", func(t *testing.T) {
		token := "test-token-123"
		hash1 := HashShareToken(token)
		hash2 := HashShareToken(token)
		if hash1 != hash2 {
			t.Errorf("Same token should produce same hash: %s != %s", hash1, hash2)
		}
	})

	t.Run("different tokens produce different hashes", func(t *testing.T) {
		hash1 := HashShareToken("token-a")
		hash2 := HashShareToken("token-b")
		if hash1 == hash2 {
			t.Error("Different tokens should produce different hashes")
		}
	})

	t.Run("hash is hex-encoded SHA-256 (64 chars)", func(t *testing.T) {
		hash := HashShareToken("any-token")
		if len(hash) != 64 {
			t.Errorf("Expected 64-char hex hash, got %d chars: %s", len(hash), hash)
		}
	})

	t.Run("raw token is not in hash", func(t *testing.T) {
		token := "my-secret-share-token"
		hash := HashShareToken(token)
		if hash == token {
			t.Error("Hash should not equal raw token")
		}
	})
}

func TestCreateShareLink_StoresHash_ReturnsRawToken(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
		return &models.Story{ID: storyID, Title: "Test Story"}, nil
	}
	mockDAO.MockGetShareLinksByAuthor = func(_, _ string) ([]models.ShareLink, error) {
		return []models.ShareLink{}, nil
	}

	var storedToken string
	mockDAO.MockCreateShareLink = func(link models.ShareLink) error {
		storedToken = link.Token
		return nil
	}

	body, _ := json.Marshal(models.CreateShareLinkRequest{
		ReaderEmail:     "reader@test.com",
		ReaderFirstName: "Jane",
		ReaderLastName:  "Doe",
		CommentsEnabled: true,
	})

	req := createTestRequestWithSession("POST", "/stories/story123/share", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req = mux.SetURLVars(req, map[string]string{"storyID": "story123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	CreateShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var responseLink models.ShareLink
	if err := json.Unmarshal(rr.Body.Bytes(), &responseLink); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	// The response token should be the raw token (not a hash)
	if responseLink.Token == "" {
		t.Fatal("Response should contain a non-empty token")
	}

	// The stored token should be a SHA-256 hash (64 hex chars)
	if len(storedToken) != 64 {
		t.Errorf("Stored token should be a 64-char hash, got %d chars: %s", len(storedToken), storedToken)
	}

	// The response token should NOT equal the stored hash
	if responseLink.Token == storedToken {
		t.Error("Response token should be raw, not the hash stored in DB")
	}

	// Hashing the response token should equal the stored hash
	if HashShareToken(responseLink.Token) != storedToken {
		t.Error("Hash of response token should match stored hash")
	}
}

func TestRevokeShareLink_UsesHash(t *testing.T) {
	rawToken := "raw-revoke-token"
	tokenHash := HashShareToken(rawToken)

	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetShareLink = func(token string) (*models.ShareLink, error) {
		if token != tokenHash {
			t.Errorf("GetShareLink called with raw token instead of hash: %s", token)
		}
		return &models.ShareLink{
			Token:       tokenHash,
			AuthorEmail: "test@example.com",
			StoryID:     "story123",
		}, nil
	}

	var revokedToken string
	mockDAO.MockRevokeShareLink = func(token string) error {
		revokedToken = token
		return nil
	}

	req := createTestRequestWithSession("PUT", "/share-links/"+rawToken+"/revoke", nil)
	req = mux.SetURLVars(req, map[string]string{"token": rawToken})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	RevokeShareLinkEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	if revokedToken != tokenHash {
		t.Errorf("RevokeShareLink should be called with hash, got: %s", revokedToken)
	}
}
