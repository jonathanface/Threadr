// sessions/sessions.go
package sessions

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	gsessions "github.com/gorilla/sessions"
)

var Store *gsessions.CookieStore

// tokenMap stores mobile session tokens -> user data
var tokenMap sync.Map

// tokenData holds user information for mobile sessions
type tokenData struct {
	UserInfo interface{}
}

// Initialize validates and initializes the session store. Must be called at startup.
func Initialize() error {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		return errors.New("SESSION_SECRET environment variable is required")
	}
	if len(secret) < 32 {
		return errors.New("SESSION_SECRET must be at least 32 characters for security")
	}
	Store = gsessions.NewCookieStore([]byte(secret))
	return nil
}

func Get(req *http.Request, key string) (*gsessions.Session, error) {
	return Store.Get(req, key)
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func OptionsFor(r *http.Request) *gsessions.Options {
	return &gsessions.Options{
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	}
}

// Delete clears the session and also sends one or two extra Set-Cookie headers
// to cover edge cases (duplicate cookies with different Path).
func Delete(w http.ResponseWriter, r *http.Request, key string) error {
	// Primary: via gorilla/sessions (matches OptionsFor)
	sess, err := Store.Get(r, key)
	if err != nil {
		return err
	}
	opts := OptionsFor(r)
	opts.MaxAge = -1
	sess.Options = opts
	for k := range sess.Values {
		delete(sess.Values, k)
	}
	if err := sess.Save(r, w); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: key, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(0, 0),
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
	if p := r.URL.Path; p != "" && p != "/" {
		http.SetCookie(w, &http.Cookie{
			Name: key, Value: "", Path: p, MaxAge: -1, Expires: time.Unix(0, 0),
			HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
		})
	}

	return nil
}

// GenerateSessionToken creates a cryptographically random session token
func GenerateSessionToken() string {
	b := make([]byte, 32) // 256 bits
	if _, err := rand.Read(b); err != nil {
		panic(err) // Should never happen
	}
	return hex.EncodeToString(b)
}

// StoreTokenMapping stores a mobile token -> user data mapping
func StoreTokenMapping(token string, userInfo interface{}) {
	tokenMap.Store(token, &tokenData{UserInfo: userInfo})
	tokenPreview := token
	if len(tokenPreview) > 12 {
		tokenPreview = tokenPreview[:12] + "..."
	}
	// Try to extract email for logging
	email := "unknown"
	if ui, ok := userInfo.(interface{ GetEmail() string }); ok {
		email = ui.GetEmail()
	} else if m, ok := userInfo.(map[string]interface{}); ok {
		if e, ok := m["Email"].(string); ok {
			email = e
		}
	}
	log.Printf("[sessions] Stored token mapping: %s for user: %s", tokenPreview, email)
}

// GetUserByToken retrieves the user data for a mobile token
func GetUserByToken(token string) (interface{}, bool) {
	tokenPreview := token
	if len(tokenPreview) > 12 {
		tokenPreview = tokenPreview[:12] + "..."
	}

	val, ok := tokenMap.Load(token)
	if !ok {
		log.Printf("[sessions] Token not found in map: %s", tokenPreview)
		return nil, false
	}
	data, ok := val.(*tokenData)
	if !ok {
		log.Printf("[sessions] Invalid data format for token: %s", tokenPreview)
		return nil, false
	}
	log.Printf("[sessions] Token found in map: %s", tokenPreview)
	return data.UserInfo, true
}

// DeleteTokenMapping removes a token mapping (for logout)
func DeleteTokenMapping(token string) {
	tokenMap.Delete(token)
}
