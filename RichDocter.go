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
	stripe "github.com/stripe/stripe-go/v72"
)

const (
	port           = ":80"
	staticFilesDir = "static/rd-ui/build"
	servicePath    = "/api"
	billingPath    = "/billing"
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
		if !user.Subscriber {
			if r.Method == "POST" {
				stories, chapters, err := dao.GetTotalCreatedStoriesAndChapters(user.Email)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if stories == 1 || chapters == 1 {
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

	stripe.Key = os.Getenv("STRIPE_KEY")

	dao = daos.NewDAO()
	auth.New()

	rtr := mux.NewRouter()
	// DEV ONLY!!
	//rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/logout/{provider}", auth.Logout)
	rtr.HandleFunc("/auth/{provider}", auth.Login)
	rtr.HandleFunc("/auth/{provider}/callback", auth.Callback)

	billingPath := rtr.PathPrefix(billingPath).Subrouter()
	billingPath.HandleFunc("/customer", billing.CreateCustomerEndpoint).Methods("POST", "OPTIONS")
	billingPath.HandleFunc("/card", billing.CreateCustomerEndpoint).Methods("POST", "OPTIONS")

	apiPath := rtr.PathPrefix(servicePath).Subrouter()
	apiPath.Use(accessControlMiddleware)

	// GETs
	apiPath.HandleFunc("/user", api.GetUserData).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories", api.AllStandaloneStoriesEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}", api.StoryEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/full", api.FullStoryEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/content", api.StoryBlocksEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.AllAssociationsByStoryEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/series/{series}/volumes", api.AllSeriesVolumesEndPoint).Methods("GET", "OPTIONS")

	// POSTs
	apiPath.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/chapter", api.CreateStoryChapterEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiPath.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/orderMap", api.RewriteBlockOrderEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.WriteAssocationsEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations/{association}/upload", api.UploadPortraitEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/export", api.ExportStoryEndpoint).Methods("PUT", "OPTIONS")

	// DELETEs
	apiPath.HandleFunc("/stories/{story}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/chapter", api.DeleteChaptersEndpoint).Methods("DELETE", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}", api.DeleteStoryEndpoint).Methods("DELETE", "OPTIONS")

	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(port, nil))
}
