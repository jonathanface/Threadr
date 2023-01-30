package main

import (
	"RichDocter/api"
	"RichDocter/auth"
	"RichDocter/sessions"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/mux"
)

const (
	port           = ":83"
	staticFilesDir = "static/rd-ui/build/"
	rootDir        = "/"
	servicePath    = "/api"
)

func serveRootDirectory(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Serving root")
	abs, err := filepath.Abs(".")
	if err != nil {
		log.Println(err.Error())
		return
	}
	cleanedPath := filepath.Clean(r.URL.Path)
	truePath := abs + string(os.PathSeparator) + staticFilesDir + cleanedPath
	if _, err := os.Stat(truePath); os.IsNotExist(err) {
		// return an error if this is a bad API request
		//if strings.Contains(r.URL.Path, SERVICE_PATH) {
		//	API.RespondWithError(w, http.StatusNotFound, err.Error())
		//	return
		//}
		http.StripPrefix(r.URL.Path, http.FileServer(http.Dir(rootDir))).ServeHTTP(w, r)
		return
	}
	http.FileServer(http.Dir("."+string(os.PathSeparator)+staticFilesDir+string(os.PathSeparator))).ServeHTTP(w, r)
}

// TODO no allow-origin for prod
func accessControlMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")

		if r.Method == "OPTIONS" {
			return
		}
		token, err := sessions.Get(r, "token")
		if err != nil || token.Values["token_data"] == nil {
			api.RespondWithError(w, http.StatusNotFound, "cannot find token")
			return
		}
		pc := auth.PseudoCookie{}
		if err = json.Unmarshal(token.Values["token_data"].([]byte), &pc); err != nil {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		switch pc.Type {
		case auth.TokenTypeGoogle:
			tokenCheck := auth.ValidateGoogleToken(w, r)
			if tokenCheck != nil {
				api.RespondWithError(w, http.StatusBadRequest, "invalid token")
				return
			}
			break
		default:
			api.RespondWithError(w, http.StatusBadRequest, "unable to determine token oauth type")
			return
		}
		/*
			// here we should check our accounts table based on email from decoded claims
			// upsert the user account in the db

		}*/
		if next != nil {
			next.ServeHTTP(w, r)
		}
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == "OPTIONS" {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Listening for http on " + port)
	rtr := mux.NewRouter()
	rtr.Use(corsMiddleware)

	rtr.HandleFunc("/auth/google/token", auth.RequestGoogleToken).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/auth/google/receive", auth.ReceiveGoogleToken).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("DELETE", "OPTIONS")

	apiPath := rtr.PathPrefix(servicePath).Subrouter()
	apiPath.Use(accessControlMiddleware)

	// GETs
	apiPath.HandleFunc("/user", auth.GetUserData).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories", api.AllStoriesEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{storyID}", api.StoryEndPoint).Methods("GET", "OPTIONS")

	//rtr.HandleFunc(SERVICE_PATH+"/auth/google/response", api.GetGoogleAuthResponse).Methods("GET", "OPTIONS")

	// PUTs
	//rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/title", middleware(API.EditTitleEndPoint)).Methods("PUT")

	// POSTs
	//rtr.HandleFunc(SERVICE_PATH+"/story", middleware(API.CreateStoryEndPoint)).Methods("POST")

	// DELETEs
	//rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}", middleware(API.DeleteStoryEndPoint)).Methods("DELETE")

	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(port, nil))
}
