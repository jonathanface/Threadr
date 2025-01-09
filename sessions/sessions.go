package sessions

import (
	"log"
	"net/http"
	"os"

	gsessions "github.com/gorilla/sessions"
	"github.com/joho/godotenv"
)

func init() {
	if os.Getenv("APP_MODE") != "PRODUCTION" {
		if err := godotenv.Load(); err != nil {
			log.Println("Error loading .env file for session store")
		}
	}
}

var store = gsessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))

func Get(req *http.Request, key string) (*gsessions.Session, error) {
	cookie, err := store.Get(req, key)
	//cookie.Options.SameSite = http.SameSiteLaxMode
	return cookie, err
}
