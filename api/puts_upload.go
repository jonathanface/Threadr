package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gorilla/mux"
)

//nolint:funlen // Multi-step portrait upload: validate, scale, S3 put, DAO update; sequential.
func UploadPortraitEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email           string
		err             error
		storyID         string
		associationID   string
		associationType string
		dao             daos.DaoInterface
		ok              bool
		awsCfg          aws.Config
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if associationID, err = url.PathUnescape(mux.Vars(r)["association"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association name")
		return
	}
	if associationID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association name")
		return
	}
	associationType = r.URL.Query().Get("type")
	if associationType == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association type")
		return
	}

	// Bound the entire request body, not just the in-memory portion.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	const parseFormMemoryBudget = 10 << 20            // 10 MB in-memory budget; body already bounded above
	err = r.ParseMultipartForm(parseFormMemoryBudget) //nolint:gosec // body bounded by MaxBytesReader above
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	defer file.Close()

	// Enforce maximum file size to protect against excessive memory allocation
	if handler.Size <= 0 || handler.Size > maxUploadSize {
		maxMB := maxUploadSize / (oneMB * oneMB)
		RespondWithError(
			w,
			http.StatusBadRequest,
			fmt.Sprintf(
				"File is too large (max %dMB) or invalid size. Final scaled size of your image: %d",
				maxMB,
				handler.Size,
			),
		)
		return
	}

	allowedTypes := []string{contentTypeJPEG, contentTypePNG, contentTypeGIF}
	fileBytes := make([]byte, handler.Size)
	if _, err = file.Read(fileBytes); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	fileType := http.DetectContentType(fileBytes)
	allowed := slices.Contains(allowedTypes, fileType)
	if !allowed {
		RespondWithError(w, http.StatusBadRequest, "Invalid file type")
		return
	}

	if _, err = file.Seek(0, io.SeekStart); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
		return
	}
	// Scale down the image if it exceeds the maximum width
	scaledImageBuf, _, err := scaleDownImage(file)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// Check the size of the scaled image
	if scaledImageBuf.Len() > maxScaledSize {
		maxMB := maxScaledSize / (oneMB * oneMB)
		RespondWithError(
			w,
			http.StatusBadRequest,
			fmt.Sprintf("Scaled image must be < %dMB (try a simpler image)", maxMB),
		)
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(r.Context(), email, storyID); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}

	// Get the old portrait URL to delete it before uploading new one
	oldAssociation, err := dao.GetAssociationDetails(r.Context(), email, storyID, associationID)
	if err != nil {
		logger.Warn("Failed to get old association details, continuing with upload",
			"error", err,
			"storyId", storyID,
			"associationId", associationID)
	} else if oldAssociation != nil {
		// Delete the old portrait image
		if err = deleteS3Image(oldAssociation.Portrait, s3CustomPortraitBucket); err != nil {
			logger.Warn("Failed to delete old portrait image, continuing with upload",
				"error", err,
				"storyId", storyID,
				"associationId", associationID,
				"oldPortraitURL", oldAssociation.Portrait)
		}
	}

	ext := filepath.Ext(handler.Filename)
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	filename := safeEmail + "_" + storyOrSeriesID + "_" + associationID + "_" + associationType + ext

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(s3CustomPortraitBucket),
		Key:         aws.String(filename),
		Body:        scaledImageBuf,
		ContentType: aws.String(fileType),
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	portraitURL := "https://" + s3CustomPortraitBucket + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if err = dao.UpdateAssociationPortraitEntryInDB(
		r.Context(),
		email,
		storyOrSeriesID,
		associationID,
		portraitURL,
	); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, models.Answer{Success: true, URL: portraitURL})
}
