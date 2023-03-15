package api

import (
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/joho/godotenv"
)

var AwsClient *dynamodb.Client
var maxAWSRetries int
var blockTableMinWriteCapacity int

const (
	writeBatchSize           = 50
	associationTypeCharacter = "character"
	associationTypePlace     = "place"
	associationTypeEvent     = "event"
)

type StoryBlock struct {
	KeyID string          `json:"keyID" dynamodbav:"key_id"`
	Chunk json.RawMessage `json:"chunk" dynamodbav:"chunk"`
	Place string          `json:"place" dynamodbav:"place"`
}
type StoryBlocks struct {
	Title  string       `json:"title" dynamodbav:"title"`
	Blocks []StoryBlock `json:"blocks" dynamodbav:"blocks"`
}

type Association struct {
	Name string `json:"association_name" dynamodbav:"association_name"`
	Type string `json:"association_type" dynamodbav:"association_type"`
}

type Chapter struct {
	KeyID        string `json:"key_id" dynamodbav:"key_id"`
	ChapterNum   int    `json:"chapter_num" dynamodbav:"chapter_num"`
	ChapterTitle string `json:"chapter_title" dynamodbav:"chapter_title"`
}

type Story struct {
	Title       string    `json:"title" dynamodbav:"title"`
	Description string    `json:"description" dynamodbav:"description"`
	Series      string    `json:"series" dynamodbav:"series"`
	Place       int       `json:"place" dynamodbav:"place"`
	Chapters    []Chapter `json:"chapters"`
}

func init() {
	var (
		awsCfg aws.Config
		err    error
	)
	if os.Getenv("APP_MODE") != "PRODUCTION" {
		if err = godotenv.Load(); err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		panic(err)
	}
	if maxAWSRetries, err = strconv.Atoi(os.Getenv("AWS_MAX_RETRIES")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	if blockTableMinWriteCapacity, err = strconv.Atoi(os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	awsCfg.RetryMaxAttempts = maxAWSRetries
	AwsClient = dynamodb.NewFromConfig(awsCfg)
}

func awsWriteTransaction(writeItemsInput *dynamodb.TransactWriteItemsInput) (statusCode int, awsError string) {
	if writeItemsInput == nil {
		return http.StatusBadRequest, "writeItemsInput is nil"
	}
	maxItemsPerSecond := blockTableMinWriteCapacity / 2 // Adjust as needed based on the size of your items and the amount of provisioned capacity.

	for numRetries := 0; numRetries < maxAWSRetries; numRetries++ {
		if _, err := AwsClient.TransactWriteItems(context.Background(), writeItemsInput); err == nil {
			return http.StatusOK, ""
		} else if opErr, ok := err.(*smithy.OperationError); ok {
			if txnErr, ok := opErr.Unwrap().(*types.TransactionCanceledException); ok && txnErr.CancellationReasons != nil {
				for _, reason := range txnErr.CancellationReasons {
					if reason.Code == aws.String("ConditionalCheckFailed") {
						continue
					}
					// For other types of cancellation reasons, we retry.
					if reason.Code == aws.String("TransactionConflict") || reason.Code == aws.String("CapacityExceededException") {
						var delay time.Duration
						if reason.Code == aws.String("CapacityExceededException") {
							delay = time.Duration(float64(time.Second) / float64(maxItemsPerSecond))
						} else {
							delay = time.Duration((1 << uint(numRetries)) * time.Millisecond)
						}
						time.Sleep(delay)
						break
					} else {
						var code int
						if code, err = strconv.Atoi(*reason.Code); err != nil {
							return http.StatusInternalServerError, fmt.Sprintf("parsing error: %s", err.Error())
						}
						return code, fmt.Sprintf("transaction cancelled: %s", *reason.Message)
					}
				}
			}
		} else {
			return http.StatusInternalServerError, err.Error()
		}
	}
	return http.StatusTooManyRequests, fmt.Sprintf("transaction cancelled after %d retries", maxAWSRetries)
}

func getUserEmail(r *http.Request) (string, error) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	user := UserInfo{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		return "", err
	}
	return user.Email, nil
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
