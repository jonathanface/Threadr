package auth

import (
	"RichDocter/api"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/amazon"
	"github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/microsoftonline"
)

func New() {
	goth.UseProviders(
		google.New(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"), os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"), os.Getenv("GOOGLE_OAUTH_REDIRECT_URL")),
		amazon.New(os.Getenv("AMAZON_OAUTH_CLIENT_ID"), os.Getenv("AMAZON_OAUTH_CLIENT_SECRET"), os.Getenv("AMAZON_OAUTH_REDIRECT_URL")),
		microsoftonline.New(os.Getenv("MSN_OAUTH_CLIENT_ID"), os.Getenv("MSN_OAUTH_CLIENT_SECRET"), os.Getenv("MSN_OAUTH_REDIRECT_URL")),
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
	var (
		provider string
		err      error
	)
	if provider, err = url.PathUnescape(mux.Vars(r)["provider"]); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, "Error parsing provider")
		return
	}
	if provider == "" {
		api.RespondWithError(w, http.StatusBadRequest, "Missing provider")
		return
	}

	sess, err := sessions.Get(r, "login_referral")
	if err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	user, err := gothic.CompleteUserAuth(w, r)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	info := models.UserInfo{}
	info.AuthType = mux.Vars(r)["provider"]
	info.Email = user.Email
	info.AuthType = mux.Vars(r)["provider"]
	info.FirstName = determineName(user)
	var (
		dao         daos.DaoInterface
		ok          bool
		fullDetails *models.UserInfo
	)
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	fullDetails, err = dao.GetUserDetails(info.Email)
	if err != nil {
		// hacky
		if err.Error() == "no user found" {
			err = dao.CreateUser(info.Email)
			if err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			}
		} else {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

	} else {
		info.CustomerID = fullDetails.CustomerID
		info.SubscriptionID = fullDetails.SubscriptionID
	}

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

func Login(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "login_referral")
	if err != nil {
		fmt.Printf("Session Error: %s\n", err.Error())
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
	err = gothic.Logout(w, r)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Location", "/")
	api.RespondWithJson(w, http.StatusTemporaryRedirect, nil)
}
