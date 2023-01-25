package main

import (
	"RichDocter/api"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/mux"
)

const (
	PORT             = ":83"
	STATIC_FILES_DIR = "static/rd-ui/build/"
	ROOT_DIR         = "/"
	SERVICE_PATH     = "/api"
)

func serveRootDirectory(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Serving root")
	abs, err := filepath.Abs(".")
	if err != nil {
		log.Println(err.Error())
		return
	}
	cleanedPath := filepath.Clean(r.URL.Path)
	truePath := abs + string(os.PathSeparator) + STATIC_FILES_DIR + cleanedPath
	if _, err := os.Stat(truePath); os.IsNotExist(err) {
		// return an error if this is a bad API request
		//if strings.Contains(r.URL.Path, SERVICE_PATH) {
		//	API.RespondWithError(w, http.StatusNotFound, err.Error())
		//	return
		//}
		http.StripPrefix(r.URL.Path, http.FileServer(http.Dir(ROOT_DIR))).ServeHTTP(w, r)
		return
	}
	http.FileServer(http.Dir("."+string(os.PathSeparator)+STATIC_FILES_DIR+string(os.PathSeparator))).ServeHTTP(w, r)
}

// TODO no allow-origin for prod
func accessControlMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS,PUT")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type")

		if r.Method == "OPTIONS" {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Listening for http on " + PORT)
	rtr := mux.NewRouter()
	rtr.Use(accessControlMiddleware)

	// GETs
	rtr.HandleFunc(SERVICE_PATH+"/stories", api.AllStoriesEndPoint).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/stories/{storyID}", api.StoryEndPoint).Methods("GET", "OPTIONS")

	// PUTs
	//rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/title", middleware(API.EditTitleEndPoint)).Methods("PUT")

	// POSTs
	//rtr.HandleFunc(SERVICE_PATH+"/story", middleware(API.CreateStoryEndPoint)).Methods("POST")

	// DELETEs
	//rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}", middleware(API.DeleteStoryEndPoint)).Methods("DELETE")

	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(PORT, nil))
}
