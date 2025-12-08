package auth

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/logger"
	"RichDocter/models"
	"RichDocter/sessions"
	"database/sql"
	"encoding/base64"
	"encoding/gob"
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

func init() {
	// Register types for gob encoding in sessions
	gob.Register(models.UserInfo{})
}

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
	logger.Debug("safeRedirect called", "dest", dest, "defaultURL", defaultURL, "allowed", allowed)
	if dest == "" {
		logger.Debug("safeRedirect: dest is empty, returning default")
		return defaultURL
	}
	if strings.HasPrefix(dest, "/") {
		base, _ := url.Parse(defaultURL)
		rel, _ := url.Parse(dest)
		// Reject protocol-relative URLs (e.g., "//evil.com/path")
		if rel.Host != "" {
			logger.Debug("safeRedirect: rejecting protocol-relative URL")
			return defaultURL
		}
		base.Path = rel.Path
		base.RawQuery = rel.RawQuery
		base.Fragment = rel.Fragment
		return base.String()
	}
	u, err := url.Parse(dest)
	if err != nil {
		logger.Debug("safeRedirect: failed to parse dest URL", "error", err)
		return defaultURL
	}
	if u.Host == "" {
		logger.Debug("safeRedirect: dest has no host")
		return defaultURL
	}
	logger.Debug("safeRedirect: checking against allowed origins", "destScheme", u.Scheme, "destHost", u.Host)
	for _, origin := range allowed {
		a, _ := url.Parse(origin)
		logger.Debug("safeRedirect: comparing", "destScheme", u.Scheme, "allowedScheme", a.Scheme, "destHost", u.Host, "allowedHost", a.Host)
		if strings.EqualFold(u.Scheme, a.Scheme) && strings.EqualFold(u.Host, a.Host) {
			// ok: preserve path/query from dest
			logger.Info("safeRedirect: MATCH found, allowing redirect", "dest", u.String())
			return u.String()
		}
	}
	logger.Info("safeRedirect: no match found, returning default", "dest", dest, "default", defaultURL)
	return defaultURL
}

func callbackWithOptions(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	logger.Info("=== CALLBACK STARTED ===", "url", r.URL.String(), "remoteAddr", r.RemoteAddr)

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
	userDetails, err := dao.GetUserDetails(r.Context(), info.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			logger.Info("New user detected, creating account", "email", info.Email, "provider", provider, "remoteAddr", r.RemoteAddr)
			if userDetails, err = dao.CreateUser(r.Context(), info.Email); err != nil {
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
		if err := dao.UpdateUser(r.Context(), updateInfo); err != nil {
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
	allowedOrigins := []string{
		options.FrontEndURL,
		"minidocter://auth", // Allow mobile app deep link
	}
	next := frontend
	if rdx := r.URL.Query().Get("next"); rdx != "" {
		logger.Info("Found next parameter in callback query", "next", rdx, "remoteAddr", r.RemoteAddr)
		next = safeRedirect(rdx, frontend, allowedOrigins)
		logger.Info("After safeRedirect from query", "next", next, "remoteAddr", r.RemoteAddr)
	} else if loginSess, _ := sessions.Get(r, "login_referral"); loginSess != nil && !loginSess.IsNew {
		if ref, _ := loginSess.Values["referrer"].(string); ref != "" {
			logger.Info("Found referrer in login_referral session", "referrer", ref, "remoteAddr", r.RemoteAddr)
			next = safeRedirect(ref, frontend, allowedOrigins)
			logger.Info("After safeRedirect from session", "next", next, "frontend", frontend, "remoteAddr", r.RemoteAddr)
		}
		// Clear the one-time referral cookie now that we've used it
		_ = sessions.Delete(w, r, "login_referral")
	} else {
		logger.Info("No next parameter or referrer found, using default frontend", "frontend", frontend, "remoteAddr", r.RemoteAddr)
	}

	updated, err := dao.IsUserSubscribed(r.Context(), *userDetails)
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
			if err := dao.UpdateUser(r.Context(), *updated); err != nil {
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
	logger.Info("=== FINAL REDIRECT ===", "redirectTo", next, "email", info.Email)

	// For mobile deep links, append the session token as a query parameter
	// since mobile apps can't access browser cookies
	if strings.HasPrefix(next, "minidocter://") {
		tokenB64 := base64.URLEncoding.EncodeToString(toJSON)
		separator := "?"
		if strings.Contains(next, "?") {
			separator = "&"
		}
		next = next + separator + "token=" + url.QueryEscape(tokenB64)
		logger.Info("Appended token to mobile deep link", "email", info.Email)
	}

	http.Redirect(w, r, next, http.StatusTemporaryRedirect)
}

// MobileSessionHandler exchanges a mobile token for a session token
func MobileSessionHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get token from request body
		var reqBody struct {
			Token string `json:"token"`
		}

		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			logger.Error("Failed to decode mobile session request", "error", err)
			api.RespondWithError(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		// Decode the base64 token
		tokenJSON, err := base64.URLEncoding.DecodeString(reqBody.Token)
		if err != nil {
			logger.Error("Failed to decode mobile token", "error", err)
			api.RespondWithError(w, http.StatusBadRequest, "Invalid token")
			return
		}

		// Parse the user data
		var userData models.UserInfo
		if err := json.Unmarshal(tokenJSON, &userData); err != nil {
			logger.Error("Failed to unmarshal user data from token", "error", err)
			api.RespondWithError(w, http.StatusBadRequest, "Invalid token format")
			return
		}

		// Create a session and store the user data with a session token
		sess, err := sessions.Get(r, "user_data")
		if err != nil {
			logger.Error("Failed to get user_data session", "error", err)
			api.RespondWithError(w, http.StatusInternalServerError, "Failed to create session")
			return
		}

		// Generate a unique session token for mobile
		sessionToken := sessions.GenerateSessionToken()

		// Store user data in session with the token
		sess.Values["user"] = userData
		sess.Values["mobile_token"] = sessionToken
		sess.Options = sessions.OptionsFor(r)

		if err := sess.Save(r, w); err != nil {
			logger.Error("Failed to save user_data session", "error", err)
			api.RespondWithError(w, http.StatusInternalServerError, "Failed to save session")
			return
		}

		// Also store the token -> user data mapping for header-based auth
		sessions.StoreTokenMapping(sessionToken, userData)

		logger.Info("Mobile session created", "email", userData.Email, "token", sessionToken[:8]+"...")

		// Return success with session token
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"user":         userData,
			"sessionToken": sessionToken,
		})
	}
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
