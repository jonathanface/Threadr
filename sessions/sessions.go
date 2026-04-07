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

const mobileTokenTTL = 30 * 24 * time.Hour // 30 days

// tokenData holds user information for mobile sessions
type tokenData struct {
	UserInfo  interface{}
	ExpiresAt time.Time
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

// StoreTokenMapping stores a mobile token -> user data mapping with a 30-day expiry
func StoreTokenMapping(token string, userInfo interface{}) {
	tokenMap.Store(token, &tokenData{
		UserInfo:  userInfo,
		ExpiresAt: time.Now().Add(mobileTokenTTL),
	})
}

// GetUserByToken retrieves the user data for a mobile token.
// Returns nil if the token is missing, malformed, or expired.
func GetUserByToken(token string) (interface{}, bool) {
	val, ok := tokenMap.Load(token)
	if !ok {
		log.Printf("[sessions] Token not found in map")
		return nil, false
	}
	data, ok := val.(*tokenData)
	if !ok {
		log.Printf("[sessions] Invalid data format for token")
		return nil, false
	}
	if time.Now().After(data.ExpiresAt) {
		log.Printf("[sessions] Token expired, removing")
		tokenMap.Delete(token)
		return nil, false
	}
	log.Printf("[sessions] Token found in map")
	return data.UserInfo, true
}

// DeleteTokenMapping removes a token mapping (for logout)
func DeleteTokenMapping(token string) {
	tokenMap.Delete(token)
}

// StartTokenCleanup runs a background goroutine that periodically removes expired tokens.
func StartTokenCleanup() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			tokenMap.Range(func(key, val interface{}) bool {
				if data, ok := val.(*tokenData); ok {
					if now.After(data.ExpiresAt) {
						tokenMap.Delete(key)
					}
				}
				return true
			})
		}
	}()
}
