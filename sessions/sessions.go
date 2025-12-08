// sessions/sessions.go
package sessions

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	gsessions "github.com/gorilla/sessions"
)

var Store *gsessions.CookieStore

// tokenMap stores mobile session tokens -> session IDs
var tokenMap sync.Map

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

// StoreTokenMapping stores a mobile token -> session ID mapping
func StoreTokenMapping(token, sessionID string) {
	tokenMap.Store(token, sessionID)
}

// GetSessionIDByToken retrieves the session ID for a mobile token
func GetSessionIDByToken(token string) (string, bool) {
	val, ok := tokenMap.Load(token)
	if !ok {
		return "", false
	}
	sessionID, ok := val.(string)
	return sessionID, ok
}

// DeleteTokenMapping removes a token mapping (for logout)
func DeleteTokenMapping(token string) {
	tokenMap.Delete(token)
}
