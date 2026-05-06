package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

// uploadPortraitImage handles the optional portrait-image multipart field of
// a story or series edit request. Returns ("", true) if no file was attached
// (uploads are optional), (newURL, true) on success, or ("", false) on
// failure (the HTTP error has already been written). Old images at
// oldImageURL are best-effort deleted before the new upload — failures are
// logged but don't abort the request.
func uploadPortraitImage(
	w http.ResponseWriter,
	r *http.Request,
	oldImageURL, bucket, fileBaseName string,
) (newURL string, ok bool) {
	file, handler, err := r.FormFile("file")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return "", true
		}
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return "", false
	}
	if file == nil {
		return "", true
	}
	defer file.Close()

	if delErr := deleteS3Image(oldImageURL, bucket); delErr != nil {
		logger.Warn("Failed to delete old image, continuing with upload",
			"error", delErr, "bucket", bucket, "oldImageURL", oldImageURL)
	}

	scaledBuf, fileType, vOK := readAndValidateUpload(w, file, handler)
	if !vOK {
		return "", false
	}

	filename := fileBaseName + filepath.Ext(handler.Filename)
	if err = uploadImageToS3(bucket, filename, fileType, scaledBuf); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return "", false
	}

	return "https://" + bucket + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename, true
}

// readAndValidateUpload reads the uploaded file into memory, validates its
// size against maxUploadFileSize and its detected content-type against the
// portrait allow-list (jpeg/png/gif), then scales the image down to fit the
// maximum portrait width. Returns the scaled buffer and detected MIME type
// on success. Writes the appropriate HTTP error on failure.
func readAndValidateUpload(
	w http.ResponseWriter,
	file multipart.File,
	handler *multipart.FileHeader,
) (buf *bytes.Buffer, fileType string, ok bool) {
	if handler.Size < 0 || handler.Size > maxUploadFileSize {
		RespondWithError(w, http.StatusBadRequest,
			fmt.Sprintf("File size exceeds allowed limit of %dMB", maxUploadFileSize/(oneMB*oneMB)))
		return nil, "", false
	}

	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}

	allowedTypes := []string{contentTypeJPEG, contentTypePNG, contentTypeGIF}
	fileType = http.DetectContentType(fileBytes)
	if !slices.Contains(allowedTypes, fileType) {
		RespondWithError(w, http.StatusBadRequest, "Invalid file type")
		return nil, "", false
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
		return nil, "", false
	}

	scaledImageBuf, _, err := scaleDownImage(file)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}
	if scaledImageBuf.Len() > maxUploadFileSize {
		RespondWithError(w, http.StatusBadRequest,
			fmt.Sprintf("Filesize must be < %dMB", maxUploadFileSize/(oneMB*oneMB)))
		return nil, "", false
	}
	return scaledImageBuf, fileType, true
}

// uploadImageToS3 PUTs the scaled image bytes at bucket/filename with the
// supplied content type. Loads AWS credentials from the default chain.
func uploadImageToS3(bucket, filename, contentType string, body io.Reader) error {
	awsCfg, err := config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	})
	if err != nil {
		return err
	}
	s3Client := s3.NewFromConfig(awsCfg)
	_, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(filename),
		Body:        body,
		ContentType: aws.String(contentType),
	})
	return err
}

// mergeFormStoriesIntoSeries decodes the optional "stories" form field
// (a JSON array of stories) and merges it into series.Stories: existing
// stories are updated in-place, new ones are appended and persisted via
// EditStory. Returns false if a transport-level error has already been
// written to w (callers should return).
func mergeFormStoriesIntoSeries(
	w http.ResponseWriter,
	r *http.Request,
	dao daos.DaoInterface,
	email, seriesID string,
	series *models.Series,
) bool {
	storiesJSON := r.FormValue("stories")
	if storiesJSON == "" {
		return true
	}
	var stories []models.Story
	if err := json.Unmarshal([]byte(storiesJSON), &stories); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return false
	}
	for idx, fromForm := range stories {
		exists := false
		for storedIdx, storedStory := range series.Stories {
			if storedStory.ID == fromForm.ID {
				storyCopy := stories[idx]
				series.Stories[storedIdx] = &storyCopy
				exists = true
			}
		}
		if exists {
			continue
		}
		fromForm.SeriesID = seriesID
		series.Stories = append(series.Stories, &fromForm)
		if _, err := dao.EditStory(r.Context(), email, fromForm); err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return false
		}
	}
	return true
}

// respondToDAOWriteError translates a DAO write error into an HTTP response,
// preferring AWS-specific status mapping when available, falling back to 500.
func respondToDAOWriteError(w http.ResponseWriter, err error) {
	opErr := &smithy.OperationError{}
	if errors.As(err, &opErr) {
		awsResponse := processAWSError(opErr)
		if awsResponse.Code != 0 {
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
	}
	logger.Error("Internal error", "error", err)
	RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
}

// parseStoryUploadForm bounds the request body to maxUploadSize and parses
// the multipart form. Writes a 400 on failure.
func parseStoryUploadForm(w http.ResponseWriter, r *http.Request) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(parseFormMemoryBudget); err != nil { //nolint:gosec // body bounded above
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return false
	}
	return true
}

// loadOwnedShareLink runs the auth + token-parse + ownership-check preamble
// shared by every per-token share-link endpoint. On any failure it sends an
// appropriate HTTP error and returns ok=false; callers should just return.
// On success it returns the DAO, the SHA-256 hash of the URL token, and a
// nil-checked indication that the authenticated user owns the link.
//
// The action label ("revoke", "restore", "delete") is interpolated into the
// 403 message when ownership doesn't match.
func loadOwnedShareLink(
	w http.ResponseWriter,
	r *http.Request,
	action string,
) (dao daos.DaoInterface, tokenHash string, ok bool) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return nil, "", false
	}
	rawToken, err := url.PathUnescape(mux.Vars(r)["token"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing token")
		return nil, "", false
	}
	if rawToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing token")
		return nil, "", false
	}
	tokenHash = HashShareToken(rawToken)
	dao, daoOK := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !daoOK {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return nil, "", false
	}

	link, err := dao.GetShareLink(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "share link not found")
			return nil, "", false
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}
	if link.AuthorEmail != email {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to "+action+" this share link")
		return nil, "", false
	}
	return dao, tokenHash, true
}

// loadOwnedComment runs the auth + commentID-parse + ownership-check preamble
// shared by every per-comment endpoint. On any failure it sends an appropriate
// HTTP error and returns ok=false; callers should just return.
//
// The action label ("resolve", "delete") is interpolated into the 403 message
// when ownership doesn't match.
func loadOwnedComment(
	w http.ResponseWriter,
	r *http.Request,
	action string,
) (dao daos.DaoInterface, commentID string, ok bool) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return nil, "", false
	}
	commentID, err = url.PathUnescape(mux.Vars(r)["commentID"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing comment ID")
		return nil, "", false
	}
	if commentID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing comment ID")
		return nil, "", false
	}
	dao, daoOK := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !daoOK {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return nil, "", false
	}

	comment, err := dao.GetComment(r.Context(), commentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "comment not found")
			return nil, "", false
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}
	if _, err = dao.GetStoryByID(r.Context(), email, comment.StoryID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to "+action+" this comment")
		return nil, "", false
	}
	return dao, commentID, true
}

// listResource is the shared "list everything for the authenticated user" flow:
// auth + DAO context + user-existence check + DAO list call + AWS-error-aware
// response. It runs the supplied fetch closure and writes the result as JSON.
func listResource[T any](
	w http.ResponseWriter,
	r *http.Request,
	fetch func(ctx context.Context, dao daos.DaoInterface, email string) ([]T, error),
) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if _, err = dao.GetUserDetails(r.Context(), email); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	result, err := fetch(r.Context(), dao, email)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, result)
}
