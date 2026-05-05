package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
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
	"github.com/aws/smithy-go"
	"github.com/google/uuid"
)

func CreateStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	const maxFileSize = 5 * 1024 * 1024 // 5 MB
	// image upload
	err = r.ParseMultipartForm(10 << 20)
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

	allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
	if handler.Size < 0 || handler.Size > int64(maxFileSize) {
		RespondWithError(
			w,
			http.StatusBadRequest,
			fmt.Sprintf("File size exceeds allowed limit of %dMB", maxFileSize/(1024*1024)),
		)
		return
	}
	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
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

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
		return
	}

	// Scale down the image if it exceeds the maximum width
	scaledImageBuf, _, err := scaleDownImage(file, uint(400)) //nolint:mnd
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// Check the size of the scaled image
	if scaledImageBuf.Len() > maxFileSize {
		RespondWithError(
			w,
			http.StatusBadRequest,
			fmt.Sprintf("Filesize must be < %dMB", maxFileSize/(1024*1024)),
		) //nolint:mnd
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	story := models.Story{}
	story.ID = uuid.New().String()
	story.Title = strings.TrimSpace(r.FormValue("title"))
	story.Description = strings.TrimSpace(r.FormValue("description"))

	// Validate story input (matches frontend validation)
	if validationErrors := ValidateStoryInput(story.Title, story.Description); len(validationErrors) > 0 {
		// Return first validation error
		RespondWithError(w, http.StatusBadRequest, validationErrors[0].Message)
		return
	}
	story.SeriesID = strings.TrimSpace(r.FormValue("series_id"))
	seriesTitle := strings.TrimSpace(r.FormValue("series_title"))
	if story.SeriesID == "" && len(seriesTitle) > 0 {
		story.SeriesID = uuid.New().String()
	}

	ext := filepath.Ext(handler.Filename)

	filename := story.ID + "_portrait" + ext

	var awsCfg aws.Config
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
		Bucket:      aws.String(s3StoryImagebucket),
		Key:         aws.String(filename),
		Body:        bytes.NewReader(scaledImageBuf.Bytes()),
		ContentType: aws.String(fileType),
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	story.ImageURL = "https://" + s3StoryImagebucket + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if story.ID, err = dao.CreateStory(r.Context(), email, story, seriesTitle); err != nil {
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

	firstChapterID := uuid.New().String()
	chap := models.Chapter{}
	chap.ID = firstChapterID
	chap.Title = "Chapter 1"
	chap.Place = 1
	newChapter, err := dao.CreateChapter(r.Context(), story.ID, chap, email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	story.Chapters = append(story.Chapters, newChapter)
	RespondWithJson(w, http.StatusOK, story)
}
