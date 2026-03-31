package api

import (
	"Threadr/daos"
	"Threadr/models"
	"Threadr/sessions"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/nfnt/resize"
)

const (
	S3_CUSTOM_PORTRAIT_BUCKET = "richdocter-custom-portraits"
	S3_EXPORTS_BUCKET         = "richdocter-document-exports"
	S3_STORY_IMAGE_BUCKET     = "richdocter-story-portraits"
	S3_SERIES_IMAGE_BUCKET    = "richdocter-series-portraits"
	TMP_EXPORT_DIR            = "./tmp"
	NON_SUBSCRIBER_MAX_ASSOC  = 10
)

// GetAuthenticatedUser extracts user info from either mobile token (Authorization header)
// or web cookie. This is the primary authentication helper used throughout the API.
func GetAuthenticatedUser(r *http.Request) (*models.UserInfo, error) {
	// Try mobile token-based auth first
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		sessionToken := strings.TrimPrefix(authHeader, "Bearer ")

		// Get user data from token map
		userVal, ok := sessions.GetUserByToken(sessionToken)
		if !ok {
			return nil, errors.New("invalid session token")
		}

		user, ok := userVal.(models.UserInfo)
		if !ok {
			return nil, errors.New("invalid user data format")
		}
		return &user, nil
	}

	// Fall back to cookie-based auth for web
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return nil, errors.New("unable to retrieve token")
	}
	user := models.UserInfo{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		return nil, err
	}
	return &user, nil
}

// getUserEmail is a convenience wrapper around getAuthenticatedUser
// for handlers that only need the email address
func getUserEmail(r *http.Request) (string, error) {
	user, err := GetAuthenticatedUser(r)
	if err != nil {
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

func staggeredStoryBlockRetrieval(ctx context.Context, dao daos.DaoInterface, storyID string, chapterID string, key *map[string]types.AttributeValue, accumulatedBlocks *models.BlocksData) (*models.BlocksData, error) {
	// If this is the first call, initialize accumulatedBlocks
	if accumulatedBlocks == nil {
		accumulatedBlocks = &models.BlocksData{}
	}

	blocks, err := dao.GetChapterParagraphs(ctx, storyID, chapterID, key)
	if err != nil {
		return nil, err
	}
	if blocks == nil {
		return nil, nil
	}

	// Append the retrieved blocks to accumulatedBlocks
	accumulatedBlocks.Items = append(accumulatedBlocks.Items, blocks.Items...)

	// If there are more blocks to retrieve, make a recursive call
	if blocks.LastEvaluated != nil {
		return staggeredStoryBlockRetrieval(ctx, dao, storyID, chapterID, &blocks.LastEvaluated, accumulatedBlocks)
	}
	return accumulatedBlocks, nil
}

func scaleDownImage(file io.Reader, maxWidth uint) (*bytes.Buffer, string, error) {
	// Decode the image
	img, format, err := image.Decode(file)
	if err != nil {
		return nil, "", err
	}

	// Resize if necessary
	if img.Bounds().Dx() > int(maxWidth) {
		img = resize.Resize(maxWidth, 0, img, resize.Lanczos3)
	}

	// Encode the image to a buffer
	buf := new(bytes.Buffer)
	switch format {
	case "jpeg":
		err = jpeg.Encode(buf, img, nil)
	case "png":
		err = png.Encode(buf, img)
	case "gif":
		err = gif.Encode(buf, img, &gif.Options{NumColors: 256})
	default:
		err = fmt.Errorf("unsupported image format: %s", format)
	}
	return buf, format, err
}
