package auth

import (
	"RichDocter/api"
	"RichDocter/sessions"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/google"
)

type UserInfo struct {
	FirstName string `json:"first_name"`
	Email     string `json:"email"`
}

func New() {
	goth.UseProviders(
		google.New(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"), os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"), os.Getenv("GOOGLE_OAUTH_REDIRECT_URL")),
	)
}

func determineName(info goth.User) string {
	name := info.FirstName
	if name == "" {
		name = info.Name
	}
	if name == "" {
		name = info.NickName
	}
	if name == "" {
		name = "Stranger"
	}
	return name
}

func Callback(w http.ResponseWriter, r *http.Request) {
	sess, err := sessions.Get(r, "login_referral")
	fmt.Println("Refer", sess.Values["referrer"].(string))
	if err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	user, err := gothic.CompleteUserAuth(w, r)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	info := UserInfo{}
	info.Email = user.Email
	info.FirstName = determineName(user)

	toJSON, err := json.Marshal(info)
	if err != nil {
		api.RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}
	session, _ := sessions.Get(r, "token")
	session.Values["token_data"] = toJSON
	session.Options.MaxAge = int(user.ExpiresAt.UTC().UnixNano() - time.Now().UTC().UnixNano())
	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sess.IsNew {
		http.Redirect(w, r, os.Getenv("ROOT_URL"), http.StatusTemporaryRedirect)
		return
	}
	http.Redirect(w, r, sess.Values["referrer"].(string), http.StatusTemporaryRedirect)
}

func Logout(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "token")
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	session.Options.MaxAge = -1
	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	gothic.Logout(w, r)
	w.Header().Set("Location", "/")
	api.RespondWithJson(w, http.StatusTemporaryRedirect, nil)
}

func Login(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "login_referral")
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	session.Options.Path = "/auth"
	session.Options.MaxAge = int(5 * time.Minute)
	session.Values["referrer"] = r.Header.Get("Referer")
	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := gothic.CompleteUserAuth(w, r); err != nil {
		gothic.BeginAuthHandler(w, r)
	}
}
