package auth

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/amazon"
	"github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/microsoftonline"
)

func New(options Options) {

	goth.UseProviders(
		google.New(options.GoogleId, options.GoogleSecret, options.GoogleUrl),
		amazon.New(options.AmazonId, options.AmazonSecret, options.AmazonUrl),
		microsoftonline.New(options.MsnId, options.MsnSecret, options.MsnUrl),
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

func safeRedirect(dest, fallback string) string {
	fb, _ := url.Parse(fallback)
	u, err := url.Parse(dest)
	if err != nil || u.Host == "" {
		return fallback
	}
	// same scheme+host only
	if !strings.EqualFold(u.Scheme, fb.Scheme) || !strings.EqualFold(u.Host, fb.Host) {
		return fallback
	}
	// allow only absolute path + query on your site
	return u.Scheme + "://" + u.Host + u.RequestURI()
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
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	fullDetails, err = dao.GetUserDetails(info.Email)
	if err != nil {
		// hacky
		log.Println("err getting user data", err)
		if err == sql.ErrNoRows {
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
	session, err := sessions.Get(r, "token")
	if err != nil {
		api.RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}

	root := os.Getenv("ROOT_URL")
	session.Values["token_data"] = toJSON
	session.Options.Path = "/"
	session.Options.HttpOnly = true
	session.Options.Secure = strings.HasPrefix(root, "https://")
	ttl := int(time.Until(user.ExpiresAt).Seconds())
	if ttl < 60 {
		ttl = 3600 // default 1h if provider expiry is tiny or missing
	}
	if ttl > 60*60*24*30 {
		ttl = 60 * 60 * 24 * 30 // cap to 30d
	}
	session.Options.MaxAge = ttl

	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var next = root
	if !sess.IsNew {
		if ref, _ := sess.Values["referrer"].(string); ref != "" {
			next = safeRedirect(ref, root)
		}
	}
	log.Println("redirecting to", next)
	http.Redirect(w, r, next, http.StatusTemporaryRedirect)
}

func Login(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "login_referral")
	if err != nil {
		fmt.Printf("Session Error: %s\n", err.Error())
	}
	session.Options.Path = "/auth"
	session.Options.MaxAge = int((5 * time.Minute).Seconds())
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
	api.RespondWithJson(w, http.StatusOK, nil)
}
