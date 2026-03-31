package auth

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/logger"
	"RichDocter/models"
	"RichDocter/sessions"
	"database/sql"
	"encoding/gob"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

// MobileTokenClaims represents the JWT claims for mobile token exchange
type MobileTokenClaims struct {
	jwt.RegisteredClaims
	Email      string `json:"email"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	AuthType   string `json:"auth_type"`
	Admin      bool   `json:"admin"`
	Subscriber bool   `json:"subscriber"`
}

// createSignedMobileToken creates a signed JWT for mobile token exchange
// The token is short-lived (5 minutes) as it's only used for the OAuth callback -> session exchange
func createSignedMobileToken(info models.UserInfo) (string, error) {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		return "", errors.New("SESSION_SECRET not configured")
	}

	claims := MobileTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "docter.io",
		},
		Email:      info.Email,
		FirstName:  info.FirstName,
		LastName:   info.LastName,
		AuthType:   info.AuthType,
		Admin:      info.Admin,
		Subscriber: info.Subscriber,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// verifyMobileToken verifies and parses a signed JWT mobile token
func verifyMobileToken(tokenString string) (*models.UserInfo, error) {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		return nil, errors.New("SESSION_SECRET not configured")
	}

	token, err := jwt.ParseWithClaims(tokenString, &MobileTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*MobileTokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return &models.UserInfo{
		Email:      claims.Email,
		FirstName:  claims.FirstName,
		LastName:   claims.LastName,
		AuthType:   claims.AuthType,
		Admin:      claims.Admin,
		Subscriber: claims.Subscriber,
	}, nil
}

func New(options OauthOptions) {
	gothic.Store = sessions.Store
	goth.UseProviders(
		google.New(options.GoogleId, options.GoogleSecret, options.GoogleUrl, "email", "profile"),
		amazon.New(options.AmazonId, options.AmazonSecret, options.AmazonUrl),
	)
}

func CallbackHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callbackWithOptions(w, r, options)
	}
}

func determineFirstName(info goth.User) string {
	if info.FirstName != "" {
		return info.FirstName
	}
	// Amazon only provides full Name — split it
	if info.Name != "" {
		parts := strings.SplitN(info.Name, " ", 2)
		return parts[0]
	}
	if info.NickName != "" {
		return info.NickName
	}
	return "Unknown"
}

func determineLastName(info goth.User) string {
	if info.LastName != "" {
		return info.LastName
	}
	// Amazon only provides full Name — split it
	if info.Name != "" {
		parts := strings.SplitN(info.Name, " ", 2)
		if len(parts) > 1 {
			return parts[1]
		}
	}
	return "Stranger"
}

// safeMobileRedirect validates mobile deep link URLs to prevent open redirect attacks.
// For minidocter://, only allows the "auth" host (minidocter://auth/...)
// For exp://, only allows localhost and private IP ranges (for development)
func safeMobileRedirect(dest string) (string, bool) {
	u, err := url.Parse(dest)
	if err != nil {
		return "", false
	}

	scheme := strings.ToLower(u.Scheme)

	switch scheme {
	case "minidocter":
		// minidocter:// URLs use the host as the path identifier
		// Only allow "auth" as the host (e.g., minidocter://auth or minidocter://auth/callback)
		if strings.ToLower(u.Host) == "auth" {
			return dest, true
		}
		return "", false

	case "exp":
		// exp:// is for Expo Go development only
		// Only allow localhost and private IP ranges
		host := u.Hostname()
		if isLocalOrPrivateHost(host) {
			return dest, true
		}
		return "", false

	default:
		return "", false
	}
}

// isLocalOrPrivateHost checks if a host is localhost or a private IP address
func isLocalOrPrivateHost(host string) bool {
	// Allow localhost
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}

	// Parse as IP and check for private ranges
	// Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
	parts := strings.Split(host, ".")
	if len(parts) != 4 {
		return false
	}

	// Simple check for common private ranges
	if parts[0] == "10" {
		return true
	}
	if parts[0] == "192" && parts[1] == "168" {
		return true
	}
	if parts[0] == "172" {
		octet, err := parseOctet(parts[1])
		if err == nil && octet >= 16 && octet <= 31 {
			return true
		}
	}

	return false
}

// parseOctet parses a string as an IP octet (0-255)
func parseOctet(s string) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid octet")
		}
		n = n*10 + int(c-'0')
		if n > 255 {
			return 0, errors.New("octet overflow")
		}
	}
	return n, nil
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
	isNewUser := false
	isReturningUser := false

	userDetails, err := dao.GetUserDetails(r.Context(), info.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			logger.Info("New user detected, creating account", "email", info.Email, "provider", provider, "remoteAddr", r.RemoteAddr)
			if userDetails, err = dao.CreateUser(r.Context(), info.Email); err != nil {
				logger.Error("Failed to create new user", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			// Check if this is a brand new user or a returning deleted user
			isNewUser = userDetails.NewUser
			isReturningUser = userDetails.ReturningUser
			logger.Info("User created successfully", "email", info.Email, "newUser", isNewUser, "returningUser", isReturningUser, "remoteAddr", r.RemoteAddr)
		} else {
			logger.Error("Failed to retrieve user details", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// Check if this is an email/password account trying to log in via OAuth
	if userDetails != nil && userDetails.AuthType == "email" && !isNewUser {
		logger.Info("OAuth login attempted for email account, prompting to link",
			"email", info.Email,
			"provider", provider,
			"remoteAddr", r.RemoteAddr)
		redirectURL := fmt.Sprintf("%s/link-account?email=%s&provider=%s",
			options.FrontEndURL,
			url.QueryEscape(info.Email),
			url.QueryEscape(provider))
		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	// Update user's name and auth_type from OAuth provider
	if info.FirstName != "" || info.LastName != "" {
		updateInfo := models.UserInfo{
			Email:      info.Email,
			FirstName:  info.FirstName,
			LastName:   info.LastName,
			AuthType:   info.AuthType,
			Subscriber: userDetails.Subscriber,
		}
		if err := dao.UpdateUser(r.Context(), updateInfo); err != nil {
			logger.Warn("Failed to update user name information", "error", err, "email", info.Email, "remoteAddr", r.RemoteAddr)
			// Continue even if name update fails - not critical
		}
	}

	// Copy database fields to info before marshaling into token
	info.Subscriber = userDetails.Subscriber
	info.Admin = userDetails.Admin

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

	// Build allowed origins list for mobile deep links
	allowedOrigins := []string{
		options.FrontEndURL,
		"minidocter://auth", // Always allow this for the mobile app's initial request
	}

	// Allow any exp:// scheme for Expo Go development
	// Allow minidocter:// scheme for production builds
	// These will be validated by the safeRedirect function

	next := frontend
	if rdx := r.URL.Query().Get("next"); rdx != "" {
		logger.Info("Found next parameter in callback query", "next", rdx, "remoteAddr", r.RemoteAddr)

		// For mobile app schemes, validate against allowed patterns
		if strings.HasPrefix(rdx, "minidocter://") || strings.HasPrefix(rdx, "exp://") {
			if validURL, ok := safeMobileRedirect(rdx); ok {
				logger.Info("Validated mobile redirect URL from query parameter", "url", validURL)
				next = validURL
			} else {
				logger.Warn("Rejected invalid mobile redirect URL", "url", rdx, "remoteAddr", r.RemoteAddr)
				next = frontend
			}
		} else {
			next = safeRedirect(rdx, frontend, allowedOrigins)
		}
		logger.Info("After safeRedirect from query", "next", next, "remoteAddr", r.RemoteAddr)
	} else if loginSess, _ := sessions.Get(r, "login_referral"); loginSess != nil && !loginSess.IsNew {
		if ref, _ := loginSess.Values["referrer"].(string); ref != "" {
			logger.Info("Found referrer in login_referral session", "referrer", ref, "remoteAddr", r.RemoteAddr)

			// For mobile app schemes, validate against allowed patterns
			if strings.HasPrefix(ref, "minidocter://") || strings.HasPrefix(ref, "exp://") {
				if validURL, ok := safeMobileRedirect(ref); ok {
					logger.Info("Validated mobile redirect URL from session", "url", validURL)
					next = validURL
				} else {
					logger.Warn("Rejected invalid mobile redirect URL from session", "url", ref, "remoteAddr", r.RemoteAddr)
					next = frontend
				}
			} else {
				next = safeRedirect(ref, frontend, allowedOrigins)
			}
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

	// Add user status query parameters
	separator := "?"
	if strings.Contains(next, "?") {
		separator = "&"
	}
	if isNewUser {
		next = next + separator + "new_user=true"
		separator = "&"
	}
	if isReturningUser {
		next = next + separator + "returning_user=true"
		separator = "&"
	}

	// For mobile deep links, append a signed JWT token as a query parameter
	// since mobile apps can't access browser cookies
	if strings.HasPrefix(next, "minidocter://") || strings.HasPrefix(next, "exp://") {
		signedToken, err := createSignedMobileToken(info)
		if err != nil {
			logger.Error("Failed to create signed mobile token", "error", err, "email", info.Email)
			api.RespondWithError(w, http.StatusInternalServerError, "Failed to create mobile token")
			return
		}
		next = next + separator + "token=" + url.QueryEscape(signedToken)
		logger.Info("Appended signed JWT to mobile deep link", "email", info.Email)

		// For mobile deep links, render an HTML page with JavaScript redirect
		// because HTTP redirects to custom schemes don't work reliably in Chrome Custom Tabs
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)

		// Check if this is an Expo Go deep link (exp://)
		isExpoGo := strings.HasPrefix(next, "exp://")
		instructions := "Tap the link below to return to the app"
		if isExpoGo {
			instructions = "Tap the link below to return to Expo Go"
		}

		html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%);
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 90%%;
        }
        h1 { color: #333; margin-bottom: 20px; }
        p { color: #666; margin: 10px 0; }
        .instructions {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin: 30px 0 20px 0;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0%% { transform: rotate(0deg); }
            100%% { transform: rotate(360deg); }
        }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 15px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
        }
        a:active {
            background: #5568d3;
        }
        .note {
            font-size: 14px;
            color: #999;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>✅ Authentication Successful!</h1>
        <div class="spinner"></div>
        <p class="instructions">%s:</p>
        <p><a href="%s" id="deepLink">Return to App</a></p>
        <p class="note">You can close this page after tapping the link above</p>
    </div>
    <script>
        var redirectUrl = "%s";
        var attempts = 0;
        var maxAttempts = 3;

        // Try automatic redirect for non-Expo deep links
        var isExpoGo = redirectUrl.startsWith('exp://');

        if (!isExpoGo) {
            // For standard deep links (minidocter://), try auto-redirect
            setTimeout(function() {
                window.location.href = redirectUrl;
            }, 100);

            // Also try clicking the link programmatically
            setTimeout(function() {
                document.getElementById('deepLink').click();
            }, 500);
        } else {
            // For Expo Go, don't auto-redirect - user must tap manually
            // This is because exp:// links often don't work with auto-redirect
            document.querySelector('.spinner').style.display = 'none';
        }
    </script>
</body>
</html>`, instructions, next, next)
		w.Write([]byte(html))
		return
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

		// Verify and parse the signed JWT token
		userData, err := verifyMobileToken(reqBody.Token)
		if err != nil {
			logger.Error("Failed to verify mobile token", "error", err)
			api.RespondWithError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}

		// Create a session and store the user data with a session token
		sess, err := sessions.Get(r, "user_data")
		if err != nil {
			// gorilla/sessions returns a new empty session even on error
			// (e.g. expired cookie), so we can safely continue
			logger.Warn("Existing session cookie invalid, creating fresh session", "error", err)
		}

		// Generate a unique session token for mobile
		sessionToken := sessions.GenerateSessionToken()

		// Store user data in session with the token
		sess.Values["user"] = *userData
		sess.Values["mobile_token"] = sessionToken
		sess.Options = sessions.OptionsFor(r)

		if err := sess.Save(r, w); err != nil {
			logger.Error("Failed to save user_data session", "error", err)
			api.RespondWithError(w, http.StatusInternalServerError, "Failed to save session")
			return
		}

		// Also store the token -> user data mapping for header-based auth
		sessions.StoreTokenMapping(sessionToken, *userData)

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

	// Check for mobile token-based auth
	authHeader := r.Header.Get("Authorization")
	if after, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
		sessionToken := after
		logger.Info("Logging out mobile session")

		// Delete the token from the token map
		sessions.DeleteTokenMapping(sessionToken)
		logger.Info("Mobile logout successful")
		api.RespondWithJson(w, http.StatusOK, nil)
		return
	}

	// Fall back to cookie-based logout for web
	if err := sessions.Delete(w, r, "token"); err != nil {
		logger.Error("Failed to delete token session during logout", "error", err, "remoteAddr", r.RemoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = sessions.Delete(w, r, "login_referral") // clear if exists
	_ = gothic.Logout(w, r)

	logger.Info("Web logout successful", "remoteAddr", r.RemoteAddr)
	api.RespondWithJson(w, http.StatusOK, nil)
}
