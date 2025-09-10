package main

import (
	"RichDocter/api"
	"RichDocter/auth"
	"RichDocter/billing"
	"RichDocter/daos"
	"RichDocter/models"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
)

const (
	staticFilesDir = "static/dist"
	servicePath    = "/api"
	billingPath    = "/billing"
	authPath       = "/auth"
)

func setupRouter(mode models.AppMode, dao *daos.DAO, authOptions auth.Options) *mux.Router {
	rtr := mux.NewRouter()

	rtr.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}).Methods("GET", "OPTIONS")

	if mode == models.ModeDevelopment {
		rtr.PathPrefix("/debug/pprof/").Handler(http.DefaultServeMux)
	}
	authRtr := rtr.PathPrefix(authPath).Subrouter()
	authRtr.Use(looseMiddleware(dao))
	// DEV ONLY!!
	//rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	authRtr.HandleFunc("/logout", auth.Logout).Methods("DELETE", "OPTIONS")
	authRtr.HandleFunc("/{provider}", auth.LoginHandler(authOptions)).Methods("GET", "PUT", "OPTIONS")
	authRtr.HandleFunc("/{provider}/callback", auth.CallbackHandler(authOptions)).Methods("POST", "GET", "OPTIONS")

	billingRtr := rtr.PathPrefix(billingPath).Subrouter()
	billingRtr.Use(billingMiddleware(dao))
	billingRtr.HandleFunc("/subscribe", billing.SubscribeCustomerEndpoint).Methods("POST", "OPTIONS")
	billingRtr.HandleFunc("/summary", billing.BillingSummaryEndpoint).Methods("GET", "OPTIONS")
	billingRtr.HandleFunc("/portal-session", billing.BillingPortalSessionEndpoint).Methods("POST", "OPTIONS")
	billingRtr.HandleFunc("/hook", billing.StripeWebhookEndpoint).Methods("POST", "OPTION")

	apiRtr := rtr.PathPrefix(servicePath).Subrouter()
	apiRtr.Use(strictMiddleware(dao))

	// GETs
	apiRtr.HandleFunc("/user", api.GetUserData).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories", api.AllStandaloneStoriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}", api.StoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/settings", api.StorySettingsEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/full", api.FullStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/content", api.StoryBlocksEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/thumbs", api.AllAssociationThumbnailsByStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/{associationID}", api.AssociationDetailsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}", api.SingleSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}/volumes", api.AllSeriesVolumesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}", api.ChapterDetailsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}/status", api.ChapterTableStatusEndpoint).Methods("GET", "OPTIONS")

	// POSTs
	apiRtr.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter", api.CreateStoryChapterEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}/analyze/{type}", api.AnalyzeChapterEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations", api.CreateAssociationsEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/outline", api.CreateOutlineEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiRtr.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/settings", api.EditStorySettingsEndPoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/details", api.EditStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/orderMap", api.RewriteBlockOrderEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.WriteAssocationsEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations/{association}/upload", api.UploadPortraitEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters", api.UpdateChaptersEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}", api.EditChapterEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/export", api.ExportStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.EditSeriesEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}/story/{storyID}", api.RemoveStoryFromSeriesEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/user", api.UpdateUserEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/outline", api.UpdateOutlineEndpoint).Methods("PUT", "OPTIONS")

	// DELETEs
	apiRtr.HandleFunc("/stories/{storyID}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}", api.DeleteChaptersEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}", api.DeleteStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.DeleteSeriesEndpoint).Methods("DELETE", "OPTIONS")

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
