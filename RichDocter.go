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
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
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

var dao *daos.DAO

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
		if userDetails.SubscriptionID != "" || userDetails.Expired {
			isActive, stripeErr := billing.CheckSubscriptionIsActive(*userDetails)
			if stripeErr != nil {
				if stripeErr.HTTPStatusCode == http.StatusNotFound {
					isActive = false
				}
			}
			if !isActive {
				// blank out the user's previous subscription/customer id
				user.Expired = true
				// account is no longer active
				user.SubscriptionID = ""
				err = dao.UpdateUser(user)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}

				storiesCount, err := dao.GetTotalCreatedStories(user.Email)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if storiesCount > 1 {
					// soft delete all but the earliest created story
					stories, err := dao.GetAllStories(user.Email)
					if err != nil {
						api.RespondWithError(w, http.StatusInternalServerError, err.Error())
						return
					}
					go func() {
						for idx, story := range stories {
							if idx > 0 {
								err = dao.SoftDeleteStory(user.Email, story.ID, true)
								if err != nil {
									fmt.Println(err.Error())
								}
							}

						}
					}()
				}
				// I need to somehow notify the client here
			} else {
				suspended, err := dao.CheckForSuspendedStories(user.Email)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if suspended {
					userDetails.Expired = false
					err = dao.RestoreAutomaticallyDeletedStories(user.Email)
					if err != nil {
						api.RespondWithError(w, http.StatusInternalServerError, err.Error())
						return
					}
				}
			}
		}

		if userDetails.SubscriptionID == "" {
			if r.Method == "POST" && (strings.HasSuffix(r.URL.Path, "/stories") ||
				strings.HasSuffix(r.URL.Path, "/analyze") ||
				strings.HasSuffix(r.URL.Path, "/propose")) ||
				r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export") {

				stories, err := dao.GetTotalCreatedStories(user.Email)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if stories >= 1 {
					api.RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
					return
				}
			}
			if r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/associations") {
				var storyID string
				if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				storyOrSeriesID := storyID
				if storyOrSeriesID, err = dao.IsStoryInASeries(user.Email, storyID); err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				associations, err := dao.GetStoryOrSeriesAssociationThumbnails(user.Email, storyOrSeriesID, false)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if len(associations) >= api.MAX_UNSUBSCRIBED_ASSOCIATION_LIMIT {
					api.RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
					return
				}
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
		ctx = context.WithValue(ctx, ctxkey.IsSuspended, user.Expired)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func main() {
	if os.Getenv("APP_MODE") != "PRODUCTION" {
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
		log.Println("health ok")
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

	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(port, nil))
}
