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

	"Threadr/logger"

	gsessions "github.com/gorilla/sessions"
)

// Store holds the cookie store used by web (browser) sessions. Set in Initialize().
var Store *gsessions.CookieStore //nolint:gochecknoglobals // gorilla/sessions API requires a single process-wide cookie store.

// defaultStore backs the package-level token-mapping helpers. Tests should
// construct their own *TokenStore via NewTokenStore() to avoid sharing state.
var defaultStore = NewTokenStore() //nolint:gochecknoglobals // production singleton; tests should make their own with NewTokenStore.

const mobileTokenTTL = 30 * 24 * time.Hour // 30 days

// Session token sizing. 32 bytes = 256 bits of entropy, well above the
// guidance for session-identifier strength, and we require the configured
// SESSION_SECRET to be at least the same length so it can stretch a token's
// worth of entropy.
const sessionTokenBytes = 32

// tokenData holds user information for mobile sessions.
type tokenData struct {
	UserInfo  any
	ExpiresAt time.Time
}

// TokenStore holds a concurrent-safe map of mobile session tokens to user
// data. Production uses a single process-wide instance (defaultStore); tests
// can construct their own to keep state isolated.
type TokenStore struct {
	m sync.Map
}

// NewTokenStore returns an empty TokenStore.
func NewTokenStore() *TokenStore {
	return &TokenStore{}
}

// Store records a token → userInfo mapping that expires in mobileTokenTTL.
func (s *TokenStore) Store(token string, userInfo any) {
	s.m.Store(token, &tokenData{
		UserInfo:  userInfo,
		ExpiresAt: time.Now().Add(mobileTokenTTL),
	})
}

// Lookup returns the user data for a token, or (nil, false) if the token is
// missing, malformed, or expired. Expired tokens are removed lazily on read.
func (s *TokenStore) Lookup(token string) (any, bool) {
	val, ok := s.m.Load(token)
	if !ok {
		logger.Debug("sessions: token not found in map")
		return nil, false
	}
	data, ok := val.(*tokenData)
	if !ok {
		logger.Debug("sessions: invalid data format for token")
		return nil, false
	}
	if time.Now().After(data.ExpiresAt) {
		logger.Debug("sessions: token expired, removing")
		s.m.Delete(token)
		return nil, false
	}
	logger.Debug("sessions: token found in map")
	return data.UserInfo, true
}

// Delete removes a token mapping (used for logout).
func (s *TokenStore) Delete(token string) {
	s.m.Delete(token)
}

// StartCleanup runs a background goroutine that periodically purges expired
// tokens. The goroutine runs for the life of the process.
func (s *TokenStore) StartCleanup() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			s.m.Range(func(key, val any) bool {
				if data, ok := val.(*tokenData); ok {
					if now.After(data.ExpiresAt) {
						s.m.Delete(key)
					}
				}
				return true
			})
		}
	}()
}

// Initialize validates and initializes the session store. Must be called at startup.
func Initialize() error {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		return errors.New("SESSION_SECRET environment variable is required")
	}
	if len(secret) < sessionTokenBytes {
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
	if err = sess.Save(r, w); err != nil {
		return err
	}
	// Secure is set conditionally on isHTTPS(r) so cookie deletion still works
	// during local dev over plain HTTP. The cookie itself is empty + immediately
	// expired — there's no session value to leak.
	http.SetCookie(w, &http.Cookie{ //nolint:gosec
		Name: key, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(0, 0),
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
	if p := r.URL.Path; p != "" && p != "/" {
		http.SetCookie(w, &http.Cookie{ //nolint:gosec
			Name: key, Value: "", Path: p, MaxAge: -1, Expires: time.Unix(0, 0),
			HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
		})
	}

	return nil
}

// GenerateSessionToken creates a cryptographically random session token.
func GenerateSessionToken() string {
	b := make([]byte, sessionTokenBytes) // 256 bits
	if _, err := rand.Read(b); err != nil {
		panic(err) // Should never happen
	}
	return hex.EncodeToString(b)
}

// StoreTokenMapping records a token → userInfo mapping in the package-level store.
func StoreTokenMapping(token string, userInfo any) {
	defaultStore.Store(token, userInfo)
}

// GetUserByToken returns the user data for a mobile token from the package-level store.
// Returns (nil, false) if the token is missing, malformed, or expired.
func GetUserByToken(token string) (any, bool) {
	return defaultStore.Lookup(token)
}

// DeleteTokenMapping removes a token mapping from the package-level store (for logout).
func DeleteTokenMapping(token string) {
	defaultStore.Delete(token)
}

// StartTokenCleanup starts the periodic-purge goroutine on the package-level store.
func StartTokenCleanup() {
	defaultStore.StartCleanup()
}
