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
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/amazon"
	"github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/microsoftonline"
)

const (
	oneDay = 24 * time.Hour
)

func New(options Options) {
	gothic.Store = sessions.Store
	goth.UseProviders(
		google.New(options.GoogleId, options.GoogleSecret, options.GoogleUrl),
		amazon.New(options.AmazonId, options.AmazonSecret, options.AmazonUrl),
		microsoftonline.New(options.MsnId, options.MsnSecret, options.MsnUrl),
	)
}

func CallbackHandler(options Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callbackWithOptions(w, r, options)
	}
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

func safeRedirect(dest, defaultURL string, allowed []string) string {
	if dest == "" {
		return defaultURL
	}
	if strings.HasPrefix(dest, "/") {
		base, _ := url.Parse(defaultURL)
		rel, _ := url.Parse(dest)
		base.Path = rel.Path
		base.RawQuery = rel.RawQuery
		base.Fragment = rel.Fragment
		return base.String()
	}
	u, err := url.Parse(dest)
	if err != nil || u.Host == "" {
		return defaultURL
	}
	for _, origin := range allowed {
		a, _ := url.Parse(origin)
		if strings.EqualFold(u.Scheme, a.Scheme) && strings.EqualFold(u.Host, a.Host) {
			// ok: preserve path/query from dest
			return u.String()
		}
	}
	return defaultURL
}

func callbackWithOptions(w http.ResponseWriter, r *http.Request, options Options) {
	provider, err := url.PathUnescape(mux.Vars(r)["provider"])
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, "Error parsing provider")
		return
	}
	if provider == "" {
		api.RespondWithError(w, http.StatusBadRequest, "Missing provider")
		return
	}

	user, err := gothic.CompleteUserAuth(w, r)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	info := models.UserInfo{
		AuthType:  mux.Vars(r)["provider"],
		Email:     user.Email,
		FirstName: determineName(user),
	}

	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	userDetails, err := dao.GetUserDetails(info.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			if userDetails, err = dao.CreateUser(info.Email); err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		} else {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	toJSON, err := json.Marshal(info)
	if err != nil {
		api.RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}

	tokenSess, err := sessions.Get(r, "token")
	if err != nil {
		api.RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}
	tokenSess.Values["token_data"] = toJSON

	opts := sessions.OptionsFor(r)
	opts.MaxAge = int(oneDay.Seconds())
	tokenSess.Options = opts

	if err := tokenSess.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	frontend := options.FrontEndURL
	allowedOrigins := []string{options.FrontEndURL}
	next := frontend
	if rdx := r.URL.Query().Get("next"); rdx != "" {
		next = safeRedirect(rdx, frontend, allowedOrigins)
	} else if loginSess, _ := sessions.Get(r, "login_referral"); loginSess != nil && !loginSess.IsNew {
		if ref, _ := loginSess.Values["referrer"].(string); ref != "" {
			next = safeRedirect(ref, frontend, allowedOrigins)
		}
		// Clear the one-time referral cookie now that we’ve used it
		_ = sessions.Delete(w, r, "login_referral")
	}

	updated, err := dao.IsUserSubscribed(*userDetails)
	log.Println("logincallback - usersubbed", updated, err)
	if err == nil {
		// persist Subscriber flip only when changed
		if userDetails.Subscriber != updated.Subscriber {
			if err := dao.UpdateUser(*updated); err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		// Append UX query flags and return immediately after redirect
		if updated.NotifyExpired {
			http.Redirect(w, r, next+"?expired=true", http.StatusTemporaryRedirect)
			return
		}
		if updated.NotifyRestored {
			http.Redirect(w, r, next+"?restored=true", http.StatusTemporaryRedirect)
			return
		}
	}

	http.Redirect(w, r, next, http.StatusTemporaryRedirect)
}

func LoginHandler(options Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		loginWithOptions(w, r, options)
	}
}

func loginWithOptions(w http.ResponseWriter, r *http.Request, options Options) {
	sess, err := sessions.Get(r, "login_referral")
	if err != nil {
		fmt.Printf("Session Error: %s\n", err.Error())
	}

	// Use shared options, then set TTL
	opts := sessions.OptionsFor(r)
	opts.MaxAge = int((5 * time.Minute).Seconds())
	sess.Options = opts

	next := r.URL.Query().Get("next")
	if next == "" {
		next = options.FrontEndURL
	}
	sess.Values["referrer"] = next

	if err = sess.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if _, err := gothic.CompleteUserAuth(w, r); err != nil {
		gothic.BeginAuthHandler(w, r)
	}
}

func Logout(w http.ResponseWriter, r *http.Request) {
	if err := sessions.Delete(w, r, "token"); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = sessions.Delete(w, r, "login_referral") // clear if exists
	_ = gothic.Logout(w, r)

	api.RespondWithJson(w, http.StatusOK, nil)
}
