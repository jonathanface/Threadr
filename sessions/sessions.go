// sessions/sessions.go
package sessions

import (
	"net/http"
	"os"
	"strings"
	"time"

	gsessions "github.com/gorilla/sessions"
)

var Store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))

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
