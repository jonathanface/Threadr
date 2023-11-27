package main

import (
	"RichDocter/api"
	"RichDocter/auth"
	"RichDocter/billing"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "net/http/pprof"

	"github.com/gorilla/mux"
)

const (
	port           = ":80"
	staticFilesDir = "static/rd-ui/build"
	servicePath    = "/api"
	billingPath    = "/billing"
	authPath       = "/auth"
)

var dao *daos.DAO

func serveRootDirectory(w http.ResponseWriter, r *http.Request) {
	var (
		abs string
		err error
	)
	if abs, err = filepath.Abs("."); err != nil {
		log.Println(err.Error())
		return
	}
	cleanedPath := filepath.Clean(r.URL.Path)
	truePath := abs + string(os.PathSeparator) + staticFilesDir + cleanedPath
	if _, err := os.Stat(truePath); os.IsNotExist(err) {
		// return an error if this is a missing API request
		if strings.Contains(r.URL.Path, servicePath) {
			api.RespondWithError(w, http.StatusNotFound, err.Error())
			return
		}
		http.StripPrefix(r.URL.Path, http.FileServer(http.Dir(staticFilesDir))).ServeHTTP(w, r)
		return
	}
	http.FileServer(http.Dir(staticFilesDir+string(os.PathSeparator))).ServeHTTP(w, r)
}

func looseMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
		defer cancel()
		ctx = context.WithValue(ctx, "dao", dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func billingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
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
		ctx = context.WithValue(ctx, "dao", dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func accessControlMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
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
		if user.SubscriptionID == "" {
			if r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/stories") || r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export") {
				stories, err := dao.GetTotalCreatedStories(user.Email)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if stories == 1 {
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
		ctx = context.WithValue(ctx, "dao", dao)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Launching RichDocter version", os.Getenv("VERSION"))
	log.Println("Listening for http on " + port)

	dao = daos.NewDAO()
	auth.New()

	rtr := mux.NewRouter()
	authRtr := rtr.PathPrefix(authPath).Subrouter()
	authRtr.Use(looseMiddleware)
	// DEV ONLY!!
	//rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/logout/{provider}", auth.Logout).Methods("DELETE", "OPTIONS")
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
	apiRtr.HandleFunc("/stories/{storyID}/associations", api.AllAssociationsByStoryEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")
	apiRtr.HandleFunc("/series/{series}/volumes", api.AllSeriesVolumesEndPoint).Methods("GET", "OPTIONS")

	// POSTs
	apiRtr.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/chapter", api.CreateStoryChapterEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiRtr.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/details", api.EditStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/orderMap", api.RewriteBlockOrderEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.WriteAssocationsEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations/{association}/upload", api.UploadPortraitEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/export", api.ExportStoryEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.EditSeriesEndpoint).Methods("PUT", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}/story/{storyID}", api.RemoveStoryFromSeriesEndpoint).Methods("PUT", "OPTIONS")

	// DELETEs
	apiRtr.HandleFunc("/stories/{storyID}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{storyID}/chapter/{chapterID}", api.DeleteChaptersEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/stories/{story}", api.DeleteStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiRtr.HandleFunc("/series/{seriesID}", api.DeleteSeriesEndpoint).Methods("DELETE", "OPTIONS")

	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(port, nil))
}
