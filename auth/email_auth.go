package auth

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"time"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	mailer "Threadr/email"
	"Threadr/logger"
	"Threadr/models"
	"Threadr/sessions"

	"golang.org/x/crypto/bcrypt"
)

func EmailSignupHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailSignup(w, r, options)
	}
}

func EmailLoginHandler(_ OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailLogin(w, r)
	}
}

func EmailVerifyHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailVerify(w, r, options)
	}
}

func PasswordResetRequestHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		passwordResetRequest(w, r, options)
	}
}

func ResendVerificationHandler(options OauthOptions) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resendVerification(w, r, options)
	}
}

func PasswordResetHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		passwordReset(w, r)
	}
}

func emailSignup(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req models.EmailSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	// Validate email
	if req.Email == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Email is required"})
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid email address"})
		return
	}

	// Validate name
	if req.FirstName == "" || req.LastName == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "First and last name are required"})
		return
	}
	if len(req.FirstName) > 100 || len(req.LastName) > 100 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Name must be 100 characters or less"})
		return
	}

	// Validate password
	if len(req.Password) < minPasswordLength {
		respondJSON(
			w,
			http.StatusBadRequest,
			map[string]string{"error": fmt.Sprintf("Password must be at least %d characters", minPasswordLength)},
		)
		return
	}
	if len(req.Password) > maxPasswordLength {
		respondJSON(
			w,
			http.StatusBadRequest,
			map[string]string{"error": fmt.Sprintf("Password must be %d characters or less", maxPasswordLength)},
		)
		return
	}

	// Check if account already exists
	existingUser, err := dao.GetUserDetails(r.Context(), req.Email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check existing account"})
		return
	}
	if existingUser != nil {
		authType := existingUser.AuthType
		// Detect OAuth accounts — including legacy ones without auth_type set
		if authType == "google" || authType == "amazon" {
			respondJSON(w, http.StatusConflict, map[string]any{
				"error":       "account_exists_oauth",
				fieldAuthType: authType,
				"message": fmt.Sprintf(
					"An account with this email already exists using %s. Please sign in with %s instead.",
					authType,
					authType,
				),
			})
			return
		}
		if authType != "email" && existingUser.PasswordHash == "" {
			// Legacy OAuth account without auth_type set
			provider := "Google or Amazon"
			respondJSON(w, http.StatusConflict, map[string]any{
				"error":       "account_exists_oauth",
				fieldAuthType: provider,
				"message": fmt.Sprintf(
					"An account with this email already exists using %s. Please sign in with %s instead.",
					provider,
					provider,
				),
			})
			return
		}
		respondJSON(w, http.StatusConflict, map[string]any{
			"error":   "account_exists",
			"message": "An account with this email already exists. Please sign in instead.",
		})
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("Failed to hash password", "error", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create account"})
		return
	}

	// Generate verification token
	verifyToken := sessions.GenerateSessionToken()
	tokenExpires := time.Now().Add(verificationTokenExpiry).Unix()

	// Create user
	_, err = dao.CreateEmailUser(
		r.Context(),
		req.Email,
		req.FirstName,
		req.LastName,
		string(hash),
		verifyToken,
		tokenExpires,
	)
	if err != nil {
		logger.Error("Failed to create email user", "error", err, "email", req.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create account"})
		return
	}

	// Send verification email
	go func() {
		verifyURL := fmt.Sprintf("%s/verify-email?token=%s", options.FrontEndURL, verifyToken)
		if emailErr := mailer.SendVerificationEmail(req.Email, verifyURL); emailErr != nil {
			logger.Error("Failed to send verification email", "error", emailErr, "email", req.Email)
		}
	}()

	logger.Info("Email user signup", "email", req.Email)
	respondJSON(w, http.StatusCreated, map[string]string{
		"message": "Account created. Please check your email to verify your address.",
	})
}

func emailLogin(w http.ResponseWriter, r *http.Request) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req models.EmailLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	if req.Email == "" || req.Password == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Email and password are required"})
		return
	}

	// Look up user
	user, err := dao.GetUserDetails(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Run dummy bcrypt to prevent timing-based user enumeration; result is intentionally discarded.
			_ = bcrypt.CompareHashAndPassword(
				[]byte("$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
				[]byte(req.Password),
			)
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": errInvalidCredentials})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve account"})
		return
	}

	// Check if this is an email account — anything else is not email-loginable
	if user.AuthType != "email" {
		provider := user.AuthType
		if provider == "" && user.PasswordHash == "" {
			// Legacy OAuth account without auth_type set — infer it's OAuth
			provider = "Google or Amazon"
		}
		if provider != "" {
			respondJSON(w, http.StatusConflict, map[string]any{
				"error":       "oauth_account",
				fieldAuthType: provider,
				"message": fmt.Sprintf(
					"This account uses %s sign-in. Please use %s to log in.",
					provider,
					provider,
				),
			})
			return
		}
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": errInvalidCredentials})
		return
	}

	// Check email verified
	if !user.EmailVerified {
		respondJSON(w, http.StatusForbidden, map[string]any{
			"error":   "email_not_verified",
			"message": "Please verify your email before signing in.",
		})
		return
	}

	// Verify password
	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": errInvalidCredentials})
		return
	}

	// Create session — same pattern as OAuth callback
	info := models.UserInfo{
		Email:         user.Email,
		FirstName:     user.FirstName,
		LastName:      user.LastName,
		AuthType:      "email",
		Admin:         user.Admin,
		Subscriber:    user.Subscriber,
		EmailVerified: true,
	}

	toJSON, err := json.Marshal(info)
	if err != nil {
		logger.Error("Failed to marshal user info", "error", err, "email", user.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create session"})
		return
	}

	tokenSess, err := sessions.Get(r, "token")
	if err != nil {
		logger.Warn("Could not read existing token session, creating new one", "error", err, "email", user.Email)
	}
	tokenSess.Values["token_data"] = toJSON

	opts := sessions.OptionsFor(r)
	opts.MaxAge = int(oneDay.Seconds())
	tokenSess.Options = opts

	if err = tokenSess.Save(r, w); err != nil {
		logger.Error("Failed to save token session", "error", err, "email", user.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create session"})
		return
	}

	// Update last_accessed (best-effort; login already succeeded)
	if _, err = dao.UpsertUser(r.Context(), user.Email); err != nil {
		logger.Warn("Failed to update last_accessed on email login", "email", user.Email, "error", err)
	}

	logger.Info("Email user login", "email", user.Email)
	respondJSON(w, http.StatusOK, info)
}

func emailVerify(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing verification token"})
		return
	}

	user, err := dao.FindUserByVerificationToken(r.Context(), token)
	if err != nil {
		logger.Warn("Verification token not found", "error", err)
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid or expired link"})
		return
	}

	// Check expiry
	if user.VerificationTokenExpires > 0 && time.Now().Unix() > user.VerificationTokenExpires {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid or expired link"})
		return
	}

	if err = dao.SetEmailVerified(r.Context(), user.Email); err != nil {
		logger.Error("Failed to set email verified", "error", err, "email", user.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to verify email"})
		return
	}

	logger.Info("Email verified", "email", user.Email)

	// Restore soft-deleted stories/series now that email ownership is proven
	go func() {
		dao.RestoreDataForVerifiedUser(user.Email)
	}()

	// Redirect to signin with success flag
	http.Redirect(w, r, options.FrontEndURL+"/signin?verified=true", http.StatusFound)
}

func passwordResetRequest(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req models.PasswordResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	// Always return success to prevent user enumeration
	successMsg := map[string]string{"message": "If that email exists, a password reset link has been sent."}

	if req.Email == "" {
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	user, err := dao.GetUserDetails(r.Context(), req.Email)
	if err != nil || user == nil || user.AuthType != "email" || !user.EmailVerified {
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	// Generate reset token
	resetToken := sessions.GenerateSessionToken()
	tokenExpires := time.Now().Add(resetTokenExpiry).Unix()

	if err = dao.SetResetToken(r.Context(), req.Email, resetToken, tokenExpires); err != nil {
		logger.Error("Failed to set reset token", "error", err, "email", req.Email)
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	// Send reset email
	go func() {
		resetURL := fmt.Sprintf("%s/reset-password?token=%s", options.FrontEndURL, resetToken)
		if emailErr := mailer.SendPasswordResetEmail(req.Email, resetURL); emailErr != nil {
			logger.Error("Failed to send password reset email", "error", emailErr, "email", req.Email)
		}
	}()

	logger.Info("Password reset requested", "email", req.Email)
	respondJSON(w, http.StatusOK, successMsg)
}

func resendVerification(w http.ResponseWriter, r *http.Request, options OauthOptions) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	// Always return success to prevent user enumeration.
	successMsg := map[string]string{
		"message": "If that email needs verification, a new link has been sent.",
	}

	if req.Email == "" {
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	user, err := dao.GetUserDetails(r.Context(), req.Email)
	if err != nil || user == nil || user.AuthType != "email" || user.EmailVerified {
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	verifyToken := sessions.GenerateSessionToken()
	tokenExpires := time.Now().Add(verificationTokenExpiry).Unix()

	if err = dao.SetVerificationToken(r.Context(), req.Email, verifyToken, tokenExpires); err != nil {
		logger.Error("Failed to set verification token on resend", "error", err, "email", req.Email)
		respondJSON(w, http.StatusOK, successMsg)
		return
	}

	go func() {
		verifyURL := fmt.Sprintf("%s/verify-email?token=%s", options.FrontEndURL, verifyToken)
		if emailErr := mailer.SendVerificationEmail(req.Email, verifyURL); emailErr != nil {
			logger.Error("Failed to resend verification email", "error", emailErr, "email", req.Email)
		}
	}()

	logger.Info("Verification email resent", "email", req.Email)
	respondJSON(w, http.StatusOK, successMsg)
}

func passwordReset(w http.ResponseWriter, r *http.Request) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req models.PasswordResetConfirm
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	if req.Token == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing reset token"})
		return
	}

	if len(req.NewPassword) < minPasswordLength {
		respondJSON(
			w,
			http.StatusBadRequest,
			map[string]string{"error": fmt.Sprintf("Password must be at least %d characters", minPasswordLength)},
		)
		return
	}
	if len(req.NewPassword) > maxPasswordLength {
		respondJSON(
			w,
			http.StatusBadRequest,
			map[string]string{"error": fmt.Sprintf("Password must be %d characters or less", maxPasswordLength)},
		)
		return
	}

	user, err := dao.FindUserByResetToken(r.Context(), req.Token)
	if err != nil {
		logger.Warn("Reset token not found", "error", err)
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid or expired reset token"})
		return
	}

	// Check expiry
	if user.ResetTokenExpires > 0 && time.Now().Unix() > user.ResetTokenExpires {
		respondJSON(
			w,
			http.StatusBadRequest,
			map[string]string{"error": "Reset token has expired. Please request a new one."},
		)
		return
	}

	// Hash new password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("Failed to hash password", "error", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to reset password"})
		return
	}

	if err = dao.UpdatePassword(r.Context(), user.Email, string(hash)); err != nil {
		logger.Error("Failed to update password", "error", err, "email", user.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to reset password"})
		return
	}

	logger.Info("Password reset completed", "email", user.Email)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Password reset successfully. You may now sign in."})
}

func LinkOAuthAccountHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		linkOAuthAccount(w, r)
	}
}

func linkOAuthAccount(w http.ResponseWriter, r *http.Request) {
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		respondJSON(
			w,
			http.StatusInternalServerError,
			map[string]string{"error": errDAOFromContext},
		)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthRequestBody)
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Provider string `json:"provider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errInvalidRequestBody})
		return
	}

	if req.Email == "" || req.Password == "" || req.Provider == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Email, password, and provider are required"})
		return
	}
	if req.Provider != "google" && req.Provider != "amazon" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid provider"})
		return
	}

	// Verify the user exists and is an email account
	user, err := dao.GetUserDetails(r.Context(), req.Email)
	if err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
		return
	}
	if user.AuthType != "email" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Account is not an email account"})
		return
	}

	// Verify password before allowing link
	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
		return
	}

	// Link the account — converts to OAuth, clears password fields
	if err = dao.LinkOAuthAccount(r.Context(), req.Email, req.Provider); err != nil {
		logger.Error("Failed to link OAuth account", "error", err, "email", req.Email)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to link account"})
		return
	}

	logger.Info("Account linked to OAuth", "email", req.Email, fieldProvider, req.Provider)
	respondJSON(w, http.StatusOK, map[string]string{
		"message":     "Account linked successfully. Please sign in with " + req.Provider + ".",
		fieldProvider: req.Provider,
	})
}

// respondJSON is a local helper to avoid importing the api package (which would create a cycle).
func respondJSON(w http.ResponseWriter, code int, payload any) {
	response, err := json.Marshal(payload)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"internal error"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write(response)
}
