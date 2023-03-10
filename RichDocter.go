package main

import (
	"RichDocter/api"
	"RichDocter/auth"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "net/http/pprof"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

const (
	port           = ":80"
	staticFilesDir = "static/rd-ui/build"
	servicePath    = "/api"
)

func upsertUser(email string) (err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users"),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		ReturnValues:     types.ReturnValueUpdatedNew,
		UpdateExpression: aws.String("set last_accessed=:t, created_at=if_not_exists(created_at, :t)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
		},
	}
	var out *dynamodb.UpdateItemOutput
	if out, err = api.AwsClient.UpdateItem(context.TODO(), input); err != nil {
		return err
	}
	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		fmt.Println("new account created")
	}
	return
}

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
		var user api.UserInfo
		if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
			api.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err = upsertUser(user.Email); err != nil {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// 15 sec timeout
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
		defer cancel()
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Listening for http on " + port)
	auth.New()
	rtr := mux.NewRouter()

	//rtr.HandleFunc("/auth/token/{service}", auth.ProcessTokenRequest).Methods("GET", "OPTIONS")
	//rtr.HandleFunc("/auth/google/receive", auth.ReceiveGoogleToken).Methods("GET", "OPTIONS")
	// DEV ONLY!!
	//rtr.HandleFunc("/auth/logout", auth.DeleteToken).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/logout/{provider}", auth.Logout)
	rtr.HandleFunc("/auth/{provider}", auth.Login)
	rtr.HandleFunc("/auth/{provider}/callback", auth.Callback)

	apiPath := rtr.PathPrefix(servicePath).Subrouter()
	apiPath.Use(accessControlMiddleware)

	// GETs
	apiPath.HandleFunc("/user", api.GetUserData).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories", api.AllStoriesEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}", api.StoryEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.AllAssociationsByStoryEndPoint).Methods("GET", "OPTIONS")
	apiPath.HandleFunc("/series", api.AllSeriesEndPoint).Methods("GET", "OPTIONS")

	// POSTs
	apiPath.HandleFunc("/stories", api.CreateStoryEndpoint).Methods("POST", "OPTIONS")

	// PUTs
	apiPath.HandleFunc("/stories/{story}", api.WriteBlocksToStoryEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/orderMap", api.RewriteBlockOrderEndpoint).Methods("PUT", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.WriteAssocationsEndpoint).Methods("PUT", "OPTIONS")

	// DELETEs
	apiPath.HandleFunc("/stories/{story}/block", api.DeleteBlocksFromStoryEndpoint).Methods("DELETE", "OPTIONS")
	apiPath.HandleFunc("/stories/{story}/associations", api.DeleteAssociationsEndpoint).Methods("DELETE", "OPTIONS")

	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(port, nil))
}
