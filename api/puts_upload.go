package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/logger"
	"RichDocter/models"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gorilla/mux"
)

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
	const maxUploadSize = 5 * 1024 * 1024 // 5 MB for original upload
	const maxScaledSize = 1024 * 1024     // 1 MB for final scaled image
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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

	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer file.Close()

	// Enforce maximum file size to protect against excessive memory allocation
	if handler.Size <= 0 || handler.Size > maxUploadSize {
		maxMB := maxUploadSize / (1024 * 1024)
		RespondWithError(w, http.StatusBadRequest, fmt.Sprintf("File is too large (max %dMB) or invalid size. Final scaled size of your image: %d", maxMB, handler.Size))
		return
	}

	allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileType := http.DetectContentType(fileBytes)
	allowed := false
	for _, t := range allowedTypes {
		if fileType == t {
			allowed = true
			break
		}
	}
	if !allowed {
		RespondWithError(w, http.StatusBadRequest, "Invalid file type")
		return
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
		return
	}
	// Scale down the image if it exceeds the maximum width
	scaledImageBuf, _, err := scaleDownImage(file, uint(400))
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Check the size of the scaled image
	if scaledImageBuf.Len() > maxScaledSize {
		maxMB := maxScaledSize / (1024 * 1024)
		RespondWithError(w, http.StatusBadRequest, fmt.Sprintf("Scaled image must be < %dMB (try a simpler image)", maxMB))
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(r.Context(), email, storyID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
		if err := deleteS3Image(oldAssociation.Portrait, S3_CUSTOM_PORTRAIT_BUCKET); err != nil {
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_CUSTOM_PORTRAIT_BUCKET),
		Key:         aws.String(filename),
		Body:        scaledImageBuf,
		ContentType: aws.String(fileType),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	portraitURL := "https://" + S3_CUSTOM_PORTRAIT_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if err = dao.UpdateAssociationPortraitEntryInDB(r.Context(), email, storyOrSeriesID, associationID, portraitURL); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJson(w, http.StatusOK, models.Answer{Success: true, URL: portraitURL})
}
