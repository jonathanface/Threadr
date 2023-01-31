package sessions

import (
	"net/http"
	"os"

	gsessions "github.com/gorilla/sessions"
)

var store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY")))

func Get(req *http.Request, key string) (*gsessions.Session, error) {
	cookie, err := store.Get(req, key)
	cookie.Options.SameSite = http.SameSiteLaxMode
	return cookie, err
}
