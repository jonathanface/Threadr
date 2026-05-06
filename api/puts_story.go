package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"

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

// deleteS3Image deletes an image from S3 given its full URL
// Returns nil if successful or if the URL is empty/default.
func deleteS3Image(imageURL, bucket string) error {
	if imageURL == "" {
		return nil
	}

	// Don't delete default images
	if strings.Contains(imageURL, "default") {
		logger.Debug("Skipping deletion of default image", "url", imageURL)
		return nil
	}

	// Extract the key (filename) from the URL
	// URL format: https://bucket.s3.region.amazonaws.com/filename
	parts := strings.Split(imageURL, "/")
	if len(parts) < 4 { //nolint:mnd
		logger.Warn("Invalid S3 URL format, skipping deletion", "url", imageURL)
		return nil
	}
	key := parts[len(parts)-1]

	// Load AWS config
	awsCfg, err := config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	})
	if err != nil {
		logger.Error("Failed to load AWS config for S3 deletion", "error", err)
		return err
	}

	s3Client := s3.NewFromConfig(awsCfg)
	_, err = s3Client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		logger.Error("Failed to delete S3 image",
			"error", err,
			"bucket", bucket,
			"key", key)
		return err
	}

	logger.Info("Successfully deleted old S3 image",
		"bucket", bucket,
		"key", key)
	return nil
}

func EditSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
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
	seriesID, err := url.PathUnescape(mux.Vars(r)["seriesID"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series ID")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series ID")
		return
	}

	series, err := dao.GetSeriesByID(r.Context(), email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}

	if title := strings.TrimSpace(r.FormValue("series_name")); title != "" {
		series.Title = title
	}
	if desc := strings.TrimSpace(r.FormValue("series_description")); desc != "" {
		series.Description = desc
	}
	if !mergeFormStoriesIntoSeries(w, r, dao, email, seriesID, series) {
		return
	}

	if !parseStoryUploadForm(w, r) {
		return
	}
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	newURL, ok := uploadPortraitImage(w, r, series.ImageURL, s3SeriesImageBucket, safeEmail+"_"+seriesID)
	if !ok {
		return
	}
	if newURL != "" {
		series.ImageURL = newURL
	}

	updatedSeries, err := dao.EditSeries(r.Context(), email, *series)
	if err != nil {
		respondToDAOWriteError(w, err)
		return
	}
	RespondWithJSON(w, http.StatusOK, updatedSeries)
}

func RemoveStoryFromSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID  string
		seriesID string
		email    string
		err      error
		dao      daos.DaoInterface
		ok       bool
	)

	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if seriesID, err = url.PathUnescape(mux.Vars(r)["seriesID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series name")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series ID")
		return
	}
	story, err := dao.GetStoryByID(r.Context(), email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	series, err := dao.GetSeriesByID(r.Context(), email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}

	var updatedSeries models.Series
	if updatedSeries, err = dao.RemoveStoryFromSeries(r.Context(), email, story.ID, *series); err != nil {
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
	RespondWithJSON(w, http.StatusOK, updatedSeries)
}

func EditStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
	storyID, err := url.PathUnescape(mux.Vars(r)["story"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}

	story, err := dao.GetStoryByID(r.Context(), email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	if !applyStoryFormFields(w, r, story) {
		return
	}

	if !parseStoryUploadForm(w, r) {
		return
	}
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	newURL, ok := uploadPortraitImage(w, r, story.ImageURL, s3StoryImagebucket, safeEmail+"_"+storyID)
	if !ok {
		return
	}
	if newURL != "" {
		story.ImageURL = newURL
	}

	updatedStory, err := dao.EditStory(r.Context(), email, *story)
	if err != nil {
		respondToDAOWriteError(w, err)
		return
	}
	RespondWithJSON(w, http.StatusOK, updatedStory)
}

// applyStoryFormFields applies the optional title/description/series form
// fields onto story in-place, running the same validations as the frontend.
// Returns false if a 400 has already been written for an invalid field.
func applyStoryFormFields(w http.ResponseWriter, r *http.Request, story *models.Story) bool {
	if title := strings.TrimSpace(r.FormValue("title")); title != "" {
		if vErr := ValidateStoryTitle(title); vErr != nil {
			RespondWithError(w, http.StatusBadRequest, vErr.Message)
			return false
		}
		story.Title = title
	}
	if desc := strings.TrimSpace(r.FormValue("description")); desc != "" {
		if vErr := ValidateStoryDescription(desc); vErr != nil {
			RespondWithError(w, http.StatusBadRequest, vErr.Message)
			return false
		}
		story.Description = desc
	}

	switch {
	case strings.TrimSpace(r.FormValue("series_id")) != "":
		story.SeriesID = strings.TrimSpace(r.FormValue("series_id"))
	case strings.TrimSpace(r.FormValue("series_name")) != "":
		story.SeriesID = strings.TrimSpace(r.FormValue("series_name"))
	default:
		story.SeriesID = ""
	}
	return true
}

func EditStorySettingsEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	updateSettings := models.StorySettings{}
	if err = decoder.Decode(&updateSettings); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if err = validateStorySettings(&updateSettings); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = dao.UpdateStorySettings(r.Context(), email, storyID, updateSettings)
	if err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	RespondWithJSON(w, http.StatusOK, updateSettings)
}
