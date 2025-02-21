package main

import (
	"RichDocter/api"
	"RichDocter/auth"
	"RichDocter/billing"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "net/http/pprof"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

const (
	staticFilesDir = "static/rd-ui/dist"
	servicePath    = "/api"
	billingPath    = "/billing"
	authPath       = "/auth"
)

var dao daos.DaoInterface

func looseMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
		defer cancel()
		ctx = context.WithValue(ctx, ctxkey.DAO, dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func billingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		token, err := sessions.Get(r, "token")
		if err != nil || token.IsNew {
			api.RespondWithError(w, http.StatusNotFound, "cannot find token")
			return
		}
		var user models.UserInfo
		if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
			api.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
		defer cancel()
		ctx = context.WithValue(ctx, ctxkey.DAO, dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func accessControlMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		token, err := sessions.Get(r, "token")
		if err != nil || token.IsNew {
			api.RespondWithError(w, http.StatusNotFound, "cannot find token")
			return
		}
		var user models.UserInfo
		if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
			api.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
		userDetails, err := dao.GetUserDetails(user.Email)
		if err != nil {
			api.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}

		// see if the user's a subscriber, and the subscription has expired
		if len(userDetails.SubscriptionID) > 0 && !userDetails.Renewing {
			i, err := strconv.ParseInt(userDetails.ExpiresAt, 10, 64)
			if err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			t := time.Unix(i, 0)
			if t.Before(time.Now()) {
				userDetails.Expired = true
				userDetails.SubscriptionID = ""
				err = dao.UpdateUser(*userDetails)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
			}
		}

		if userDetails.SubscriptionID == "" || userDetails.Expired {
			if r.Method == "POST" && (strings.HasSuffix(r.URL.Path, "/analyze") || strings.HasSuffix(r.URL.Path, "/propose")) ||
				r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export") {
				api.RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
				return
			}
		}
		if err = dao.UpsertUser(user.Email); err != nil {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// 15 sec timeout
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
		defer cancel()
		ctx = context.WithValue(ctx, ctxkey.DAO, dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func main() {
	currentMode := models.AppMode(strings.ToLower(os.Getenv("MODE")))
	if currentMode != models.ModeProduction && currentMode != models.ModeStaging {
		if err := godotenv.Load(); err != nil {
			log.Fatal("Error loading .env file")
		}
	}
	port := os.Getenv("PORT")
	log.Println("Launching RichDocter version", os.Getenv("VERSION"))
	log.Println("Listening for http on " + port)

	dao = daos.NewDAO()
	auth.New()

	rtr := mux.NewRouter()
	rtr.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}).Methods("GET", "OPTIONS")

	authRtr := rtr.PathPrefix(authPath).Subrouter()
	authRtr.Use(looseMiddleware)
	// DEV ONLY!!
	//rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	authRtr.HandleFunc("/logout", auth.Logout).Methods("DELETE", "OPTIONS")
	authRtr.HandleFunc("/{provider}", auth.Login).Methods("GET", "PUT", "OPTIONS")
	authRtr.HandleFunc("/{provider}/callback", auth.Callback).Methods("POST", "GET", "OPTIONS")

	billingRtr := rtr.PathPrefix(billingPath).Subrouter()
	billingRtr.Use(billingMiddleware)
	billingRtr.HandleFunc("/products", billing.GetProductsEndpoint).Methods("GET", "OPTIONS")
	billingRtr.HandleFunc("/customer", billing.GetCustomerEndpoint).Methods("GET", "OPTIONS")
	billingRtr.HandleFunc("/customer", billing.CreateCustomerEndpoint).Methods("POST", "OPTIONS")
	billingRtr.HandleFunc("/customer", billing.UpdateCustomerPaymentMethodEndpoint).Methods("PUT", "OPTIONS")
	billingRtr.HandleFunc("/card", billing.CreateCardIntentEndpoint).Methods("POST", "OPTIONS")
	billingRtr.HandleFunc("/subscribe", billing.SubscribeCustomerEndpoint).Methods("POST", "OPTIONS")

	apiRtr := rtr.PathPrefix(servicePath).Subrouter()
	apiRtr.Use(accessControlMiddleware)

	// GETs
	apiRtr.HandleFunc("/user", api.GetUserData).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories", api.AllStandaloneStoriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}", api.StoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/full", api.FullStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/content", api.StoryBlocksEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/thumbs", api.AllAssociationThumbnailsByStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations/{associationID}", api.AssociationDetailsEndpoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}", api.SingleSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}/volumes", api.AllSeriesVolumesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapters/{chapterID}", api.ChapterDetailsEndpoint).Methods("GET", "OPTIONS")

	// POSTs
	apiRtr.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter", api.CreateStoryChapterEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}/analyze/{type}", api.AnalyzeChapterEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/associations", api.CreateAssociationsEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiRtr.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
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

	// DELETEs
	apiRtr.HandleFunc("/stories/{storyID}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}", api.DeleteChaptersEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}", api.DeleteStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.DeleteSeriesEndpoint).Methods("DELETE", "OPTIONS")

	rtr.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Build the absolute path to the requested file.
		requestedPath := filepath.Join(staticFilesDir, r.URL.Path)
		// Check if the file exists and is not a directory.
		info, err := os.Stat(requestedPath)
		if err != nil || info.IsDir() {
			// Fallback to index.html for client-side routing.
			http.ServeFile(w, r, filepath.Join(staticFilesDir, "index.html"))
			return
		}
		// Otherwise, serve the file.
		http.FileServer(http.Dir(staticFilesDir)).ServeHTTP(w, r)
	}))

	log.Fatal(http.ListenAndServe(port, rtr))
}
