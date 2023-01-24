package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

const (
	PORT             = ":83"
	STATIC_FILES_DIR = "static/rd-ui/build/"
	ROOT_DIR         = "/"
	SERVICE_PATH     = "/api"
)

var awsClient *dynamodb.Client

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

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJson(w, code, map[string]string{"error": msg})
}

func RespondWithJson(w http.ResponseWriter, code int, payload interface{}) {
	var (
		response []byte
		err      error
	)
	w.Header().Set("Content-Type", "application/json")
	if response, err = json.Marshal(payload); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.WriteHeader(code)
	w.Write(response)
}

func allStoriesEndPoint(w http.ResponseWriter, r *http.Request) {

	userID := os.Getenv("USER_ID")
	if userID == "" {
		RespondWithError(w, http.StatusUnprocessableEntity, "user id not set")
	}

	out, err := awsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("attribute_not_exists(deletedAt) AND contains(user_id, :uid)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
	} else {
		fmt.Println("got", out.Items)
		RespondWithJson(w, http.StatusOK, out.Items)
	}
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

	var (
		awsCfg aws.Config
		err    error
	)
	if err = godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}
	log.Println("Listening for http on " + PORT)

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = "us-east-1"
		return nil
	}); err != nil {
		panic(err)
	}
	awsClient = dynamodb.NewFromConfig(awsCfg)

	rtr := mux.NewRouter()
	rtr.Use(accessControlMiddleware)

	// GETs
	rtr.HandleFunc(SERVICE_PATH+"/stories", allStoriesEndPoint).Methods("GET", "OPTIONS")

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
