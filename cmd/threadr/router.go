package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"Threadr/api"
	"Threadr/auth"
	"Threadr/billing"
	"Threadr/daos"
	"Threadr/models"

	"github.com/gorilla/mux"
)

const (
	staticFilesDir = "static/dist"
	servicePath    = "/api/v1"
	billingPath    = "/billing"
	authPath       = "/auth"
)

//nolint:funlen // Route table — all routes wired here on purpose so the API surface is greppable in one place.
func setupRouter(mode models.AppMode, dao *daos.DAO, authOptions auth.OauthOptions, maintenanceMode bool) *mux.Router {
	rtr := mux.NewRouter()

	// Apply CORS middleware first (must be before other middleware to handle preflight)
	rtr.Use(corsMiddleware(authOptions.FrontEndURL))

	// Apply maintenance mode middleware (allows /health to pass through)
	rtr.Use(maintenanceModeMiddleware(maintenanceMode))

	// Apply rate limiting middleware (600 req/min per IP, excludes /health)
	limiter := newRateLimiter()
	rtr.Use(rateLimitMiddleware(limiter))

	rtr.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}).Methods("GET", "OPTIONS")

	if mode == models.ModeDevelopment {
		rtr.PathPrefix("/debug/pprof/").Handler(http.DefaultServeMux)
	}
	authRtr := rtr.PathPrefix(authPath).Subrouter()
	authRtr.Use(looseMiddleware(dao))
	authLimiter := newAuthRateLimiter()
	authRtr.Use(authRateLimitMiddleware(authLimiter))
	// DEV ONLY!!
	// rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	authRtr.HandleFunc("/logout", auth.Logout).Methods("DELETE", "OPTIONS")
	authRtr.HandleFunc("/session", auth.MobileSessionHandler()).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/signup", auth.EmailSignupHandler(authOptions)).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/login", auth.EmailLoginHandler(authOptions)).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/verify", auth.EmailVerifyHandler(authOptions)).Methods("GET", "OPTIONS")
	authRtr.HandleFunc("/email/request-reset", auth.PasswordResetRequestHandler(authOptions)).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/resend-verification", auth.ResendVerificationHandler(authOptions)).
		Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/reset-password", auth.PasswordResetHandler()).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/email/link-oauth", auth.LinkOAuthAccountHandler()).Methods("POST", "OPTIONS")
	authRtr.HandleFunc("/{provider}", auth.LoginHandler(authOptions)).Methods("GET", "PUT", "OPTIONS")
	authRtr.HandleFunc("/{provider}/callback", auth.CallbackHandler(authOptions)).Methods("POST", "GET", "OPTIONS")

	billingRtr := rtr.PathPrefix(billingPath).Subrouter()
	billingRtr.Use(billingMiddleware(dao))
	billingRtr.HandleFunc("/subscribe", billing.SubscribeCustomerEndpoint).Methods("POST", "OPTIONS")
	billingRtr.HandleFunc("/summary", billing.SummaryEndpoint).Methods("GET", "OPTIONS")
	billingRtr.HandleFunc("/portal-session", billing.PortalSessionEndpoint).Methods("POST", "OPTIONS")

	rtrForStripeHook := rtr.PathPrefix(billingPath).Subrouter()
	rtrForStripeHook.HandleFunc("/hook", billing.StripeWebhookEndpoint).Methods("POST", "OPTION")

	apiRtr := rtr.PathPrefix(servicePath).Subrouter()
	apiRtr.Use(strictMiddleware(dao))

	// GETs
	apiRtr.HandleFunc("/user", api.GetUserData).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories", api.AllStandaloneStoriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}", api.StoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/settings", api.StorySettingsEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/full", api.FullStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/content", api.StoryBlocksEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/thumbs", api.AllAssociationThumbnailsByStoryEndPoint).
		Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/{associationID}", api.AssociationDetailsEndpoint).
		Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}", api.SingleSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}/volumes", api.AllSeriesVolumesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}", api.ChapterDetailsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}/status", api.ChapterTableStatusEndpoint).
		Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/alerts", api.GetUserAlertsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/alerts/unread-count", api.GetUnreadAlertCountEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/alerts/{alertID}/read", api.MarkAlertReadEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/admin/alerts", api.AdminCreateAlertEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/admin/users", api.AdminGetAllUsersEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/admin/users/{email}", api.AdminDeleteUserEndpoint).Methods("DELETE", "OPTIONS")

	// POSTs
	apiRtr.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter", api.CreateStoryChapterEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}/analyze/{type}", api.AnalyzeChapterEndpoint).
		Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations", api.CreateAssociationsEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/outline", api.CreateOutlineEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/import", api.ImportDocumentEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiRtr.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/settings", api.EditStorySettingsEndPoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/details", api.EditStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/orderMap", api.RewriteBlockOrderEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.WriteAssocationsEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations/{association}/upload", api.UploadPortraitEndpoint).
		Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters", api.UpdateChaptersEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}", api.EditChapterEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/export", api.ExportStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.EditSeriesEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}/story/{storyID}", api.RemoveStoryFromSeriesEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/user", api.UpdateUserEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/outline", api.UpdateOutlineEndpoint).Methods("PUT", "OPTIONS")

	// Sharing (author-side)
	apiRtr.HandleFunc("/stories/{storyID}/share", api.CreateShareLinkEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/share-links", api.GetShareLinksEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/comments", api.GetAuthorCommentsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/share-links/{token}/revoke", api.RevokeShareLinkEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/share-links/{token}/restore", api.RestoreShareLinkEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/share-links/{token}", api.DeleteShareLinkEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/comments/{commentID}/resolve", api.ResolveCommentEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/comments/{commentID}", api.DeleteCommentEndpoint).Methods("DELETE", "OPTIONS")

	// DELETEs
	apiRtr.HandleFunc("/stories/{storyID}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}", api.DeleteChaptersEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}", api.DeleteStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.DeleteSeriesEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/user", api.DeleteUserEndpoint).Methods("DELETE", "OPTIONS")

	// Shared reader routes (public, authenticated via share token)
	sharedRtr := rtr.PathPrefix("/api/v1/shared/{token}").Subrouter()
	sharedRtr.Use(sharedMiddleware(dao))
	sharedRtr.HandleFunc("", api.GetSharedStoryEndpoint).Methods("GET", "OPTIONS")
	sharedRtr.HandleFunc("/content", api.GetSharedContentEndpoint).Methods("GET", "OPTIONS")
	sharedRtr.HandleFunc("/comments", api.GetSharedCommentsEndpoint).Methods("GET", "OPTIONS")
	sharedRtr.HandleFunc("/comments", api.CreateCommentEndpoint).Methods("POST", "OPTIONS")
	sharedRtr.HandleFunc("/comments/{commentID}", api.DeleteOwnCommentEndpoint).Methods("DELETE", "OPTIONS")

	fileServer := http.FileServer(http.Dir(staticFilesDir))
	rtr.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath := filepath.Join(staticFilesDir, r.URL.Path)
		absStaticDir, err1 := filepath.Abs(staticFilesDir)
		absRequestedPath, err2 := filepath.Abs(requestedPath)
		if err1 != nil || err2 != nil || !strings.HasPrefix(absRequestedPath, absStaticDir) {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}
		if info, err := os.Stat(absRequestedPath); err == nil && !info.IsDir() {
			if strings.HasPrefix(r.URL.Path, "/assets/") || strings.Contains(r.URL.Path, ".") {
				// hashed assets (/assets/*.js, .css, .png, etc.)
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-store")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, filepath.Join(staticFilesDir, "index.html"))
	}))

	return rtr
}
