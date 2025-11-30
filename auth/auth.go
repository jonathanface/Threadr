package auth

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/logger"
	"RichDocter/models"
	"RichDocter/sessions"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/amazon"
	"github.com/markbates/goth/providers/google"
)

const (
	oneDay = 24 * time.Hour
)

func New(options OauthOptions) {
	gothic.Store = sessions.Store
	goth.UseProviders(
		google.New(options.GoogleId, options.GoogleSecret, options.GoogleUrl),
		amazon.New(options.AmazonId, options.AmazonSecret, options.AmazonUrl),
	)
}

func CallbackHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callbackWithOptions(w, r, options)
	}
}

func determineFirstName(info goth.User) string {
	name := info.FirstName
	if name == "" {
		name = info.NickName
	}
	if name == "" {
		name = "Unknown"
	}
	return name
}

func determineLastName(info goth.User) string {
	name := info.LastName
	if name == "" {
		name = info.Name
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
		// Reject protocol-relative URLs (e.g., "//evil.com/path")
		if rel.Host != "" {
			return defaultURL
		}
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

func callbackWithOptions(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	provider, err := url.PathUnescape(mux.Vars(r)["provider"])
	if err != nil {
		logger.Error("Failed to parse provider in callback", "error", err, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, "Error parsing provider")
		return
	}
	if provider == "" {
		logger.Warn("Missing provider in callback", "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusBadRequest, "Missing provider")
		return
	}

	logger.Info("OAuth callback initiated", "provider", provider, "remoteAddr", r.RemoteAddr)

	user, err := gothic.CompleteUserAuth(w, r)
	if err != nil {
		logger.Error("OAuth authentication failed", "error", err, "provider", provider, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	info := models.UserInfo{
		AuthType:  mux.Vars(r)["provider"],
		Email:     user.Email,
		FirstName: determineFirstName(user),
		LastName:  determineLastName(user),
	}

	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		logger.Error("Failed to get DAO from context in auth callback", "email", info.Email, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	userDetails, err := dao.GetUserDetails(info.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			logger.Info("New user detected, creating account", "email", info.Email, "provider", provider, "remoteAddr", r.RemoteAddr)
			if userDetails, err = dao.CreateUser(info.Email); err != nil {
				logger.Error("Failed to create new user", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			logger.Info("New user created successfully", "email", info.Email, "remoteAddr", r.RemoteAddr)
		} else {
			logger.Error("Failed to retrieve user details", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// Update user's name information from OAuth provider
	if info.FirstName != "" || info.LastName != "" {
		updateInfo := models.UserInfo{
			Email:      info.Email,
			FirstName:  info.FirstName,
			LastName:   info.LastName,
			Subscriber: userDetails.Subscriber,
		}
		if err := dao.UpdateUser(updateInfo); err != nil {
			logger.Warn("Failed to update user name information", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
			// Continue even if name update fails - not critical
		}
	}

	toJSON, err := json.Marshal(info)
	if err != nil {
		logger.Error("Failed to marshal user info", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}

	tokenSess, err := sessions.Get(r, "token")
	if err != nil {
		// Log the error but continue - gorilla/sessions returns a new valid session
		// even when it can't decrypt the old cookie (e.g., after SESSION_SECRET change)
		logger.Warn("Could not read existing token session, creating new one",
			"error", err,
			"email", info.Email,
			"remoteAddr", r.RemoteAddr)
	}
	tokenSess.Values["token_data"] = toJSON

	opts := sessions.OptionsFor(r)
	opts.MaxAge = int(oneDay.Seconds())
	tokenSess.Options = opts

	if err := tokenSess.Save(r, w); err != nil {
		logger.Error("Failed to save token session", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Debug("Token session saved successfully", "email", info.Email, "remoteAddr", r.RemoteAddr)

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
	if err != nil {
		logger.Error("Failed to check subscription status", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
	} else {
		logger.Debug("Subscription status checked", "email", info.Email, "subscriber", updated.Subscriber, "remoteAddr", r.RemoteAddr)
		// persist Subscriber flip only when changed
		if userDetails.Subscriber != updated.Subscriber {
			logger.Info("Subscription status changed",
				"email", info.Email,
				"previousStatus", userDetails.Subscriber,
				"newStatus", updated.Subscriber,
				"remoteAddr", r.RemoteAddr)
			if err := dao.UpdateUser(*updated); err != nil {
				logger.Error("Failed to update user subscription status", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		// Append UX query flags and return immediately after redirect
		if updated.NotifyExpired {
			logger.Info("User subscription expired", "email", info.Email, "remoteAddr", r.RemoteAddr)
			http.Redirect(w, r, next+"?expired=true", http.StatusTemporaryRedirect)
			return
		}
		if updated.NotifyRestored {
			logger.Info("User subscription restored", "email", info.Email, "remoteAddr", r.RemoteAddr)
			http.Redirect(w, r, next+"?restored=true", http.StatusTemporaryRedirect)
			return
		}
	}

	logger.Info("OAuth login successful", "email", info.Email, "provider", provider, "remoteAddr", r.RemoteAddr)
	http.Redirect(w, r, next, http.StatusTemporaryRedirect)
}

func LoginHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		loginWithOptions(w, r, options)
	}
}

func loginWithOptions(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	provider := mux.Vars(r)["provider"]
	logger.Info("Login initiated", "provider", provider, "remoteAddr", r.RemoteAddr)

	sess, err := sessions.Get(r, "login_referral")
	if err != nil {
		logger.Error("Failed to get login_referral session", "error", err, "provider", provider, "remoteAddr", r.RemoteAddr)
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
		logger.Error("Failed to save login_referral session", "error", err, "provider", provider, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Debug("Login referral session saved", "provider", provider, "next", next, "remoteAddr", r.RemoteAddr)

	if _, err := gothic.CompleteUserAuth(w, r); err != nil {
		logger.Debug("Starting OAuth flow", "provider", provider, "remoteAddr", r.RemoteAddr)
		gothic.BeginAuthHandler(w, r)
	}
}

func Logout(w http.ResponseWriter, r *http.Request) {
	logger.Info("Logout initiated", "remoteAddr", r.RemoteAddr)

	if err := sessions.Delete(w, r, "token"); err != nil {
		logger.Error("Failed to delete token session during logout", "error", err, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = sessions.Delete(w, r, "login_referral") // clear if exists
	_ = gothic.Logout(w, r)

	logger.Info("Logout successful", "remoteAddr", r.RemoteAddr)
	api.RespondWithJson(w, http.StatusOK, nil)
}
