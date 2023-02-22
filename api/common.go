package api

import (
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/joho/godotenv"
)

var AwsClient *dynamodb.Client

type PseudoCookie struct {
	AccessToken string
	IdToken     string
	Expiry      time.Time
	Type        string
	Email       string
}

func init() {
	var (
		awsCfg aws.Config
		err    error
	)
	if err = godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		panic(err)
	}
	awsCfg.RetryMaxAttempts = 15
	AwsClient = dynamodb.NewFromConfig(awsCfg)
}

func getUserEmail(r *http.Request) (string, error) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	pc := PseudoCookie{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &pc); err != nil {
		return "", err
	}
	return pc.Email, nil
}

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJson(w, code, map[string]string{"error": msg})
}

func RespondWithJson(w http.ResponseWriter, code int, payload interface{}) {
	var (
		response []byte
		err      error
	)
	if response, err = json.Marshal(payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}
