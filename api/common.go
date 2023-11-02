package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

const (
	associationTypeCharacter     = "character"
	associationTypePlace         = "place"
	associationTypeEvent         = "event"
	S3_CUSTOM_PORTRAIT_BUCKET    = "richdocter-custom-portraits"
	S3_EXPORTS_BUCKET            = "richdocter-document-exports"
	S3_STORY_IMAGE_BUCKET        = "richdocter-story-portraits"
	S3_SERIES_IMAGE_BUCKET       = "richdocter-series-portraits"
	TMP_EXPORT_DIR               = "./tmp"
	MAX_UNSUBSCRIBED_BLOCK_COUNT = 50
)

func getUserEmail(r *http.Request) (string, error) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	user := models.UserInfo{}
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

func processAWSError(opErr *smithy.OperationError) (err models.AwsStatusResponse) {
	err.Code = 0
	var resourceErr *types.ResourceNotFoundException
	if errors.As(opErr.Unwrap(), &resourceErr) {
		err.Message = *resourceErr.Message
		err.Code = http.StatusNotImplemented
		return
	}

	var conditionErr *types.ConditionalCheckFailedException
	if errors.As(opErr.Unwrap(), &conditionErr) {
		err.Message = *conditionErr.Message
		err.Code = http.StatusNotImplemented
		return
	}

	var txnErr *types.TransactionCanceledException
	if errors.As(opErr.Unwrap(), &txnErr) && txnErr.CancellationReasons != nil {
		for _, reason := range txnErr.CancellationReasons {
			switch *reason.Code {
			case "ConditionalCheckFailed":
				{
					err.Message = *reason.Message
					err.Code = http.StatusConflict
				}
			case "ResourceNotFoundException":
				{
					err.Message = *reason.Message
					err.Code = http.StatusNotImplemented
				}
			case "CapacityExceededException":
				{
					err.Message = *reason.Message
					err.Code = http.StatusServiceUnavailable
				}
			}
		}
	}
	return err
}

func staggeredStoryBlockRetrieval(dao daos.DaoInterface, email string, storyID string, chapter string, key string) (*models.BlocksData, error) {
	blocks, err := dao.GetStoryParagraphs(email, storyID, chapter, key)
	if err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				return nil, fmt.Errorf("error getting story blocks: %s", err.Error())
			}
			return nil, fmt.Errorf("error getting story blocks: %s", awsResponse.Message)
		}
		return nil, fmt.Errorf("error getting story blocks: %s", err.Error())
	}
	fmt.Println("last evaluated", blocks.LastEvaluated)
	if blocks.LastEvaluated == nil {
		return blocks, nil
	}
	lastEvaluatedKeyID, ok := blocks.LastEvaluated["key_id"]
	if !ok {
		return nil, fmt.Errorf("error getting story blocks: key_id not found in LastEvaluated")
	}
	keyID, ok := lastEvaluatedKeyID.(*types.AttributeValueMemberS)
	if !ok {
		return nil, fmt.Errorf("error getting story blocks: invalid key_id type")
	}
	return staggeredStoryBlockRetrieval(dao, email, storyID, chapter, keyID.Value)
}
