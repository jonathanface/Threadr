package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func EditSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		seriesID string
		email    string
		err      error
		dao      daos.DaoInterface
		ok       bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if seriesID, err = url.PathUnescape(mux.Vars(r)["seriesID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series ID")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series ID")
		return
	}

	series, err := dao.GetSeriesByID(email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}
	if len(strings.TrimSpace(r.FormValue("series_name"))) > 0 {
		series.Title = strings.TrimSpace(r.FormValue("series_name"))
		if series.Title == "" {
			RespondWithError(w, http.StatusBadRequest, "Series name cannot be blank")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("series_description"))) > 0 {
		series.Description = strings.TrimSpace(r.FormValue("series_description"))
	}

	storiesJSON := r.FormValue("stories")
	if storiesJSON != "" {
		var stories []models.Story
		err := json.Unmarshal([]byte(storiesJSON), &stories)
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
		for idx, fromForm := range stories {
			exists := false
			for storedIdx, storedStory := range series.Stories {
				if storedStory.ID == fromForm.ID {
					// an existing story was changed
					storyCopy := stories[idx]
					series.Stories[storedIdx] = &storyCopy
					exists = true
				}
			}
			if !exists {
				// new story was added
				fromForm.SeriesID = seriesID
				series.Stories = append(series.Stories, &fromForm)
				_, err = dao.EditStory(email, fromForm)
				if err != nil {
					RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
			}
		}
	}

	const maxFileSize = 1024 * 1024 // 1 MB
	// image upload
	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		if err != http.ErrMissingFile {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if file != nil {
		// TODO delete previous image
		defer file.Close()

		if handler.Size < 0 || handler.Size > maxFileSize {
			RespondWithError(w, http.StatusBadRequest, "File size exceeds allowed limit")
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
		if scaledImageBuf.Len() > maxFileSize {
			RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
			return
		}

		ext := filepath.Ext(handler.Filename)

		safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		filename := safeEmail + "_" + seriesID + ext

		var awsCfg aws.Config
		if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
			opts.Region = os.Getenv("AWS_REGION")
			return nil
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s3Client := s3.NewFromConfig(awsCfg)
		if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket:      aws.String(S3_SERIES_IMAGE_BUCKET),
			Key:         aws.String(filename),
			Body:        scaledImageBuf,
			ContentType: aws.String(fileType),
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		series.ImageURL = "https://" + S3_SERIES_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	}

	var updatedSeries models.Series
	if updatedSeries, err = dao.EditSeries(email, *series); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, updatedSeries)
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
	story, err := dao.GetStoryByID(email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	series, err := dao.GetSeriesByID(email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}

	var updatedSeries models.Series
	if updatedSeries, err = dao.RemoveStoryFromSeries(email, story.ID, *series); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, updatedSeries)
}

func EditStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID string
		email   string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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

	story, err := dao.GetStoryByID(email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	if len(strings.TrimSpace(r.FormValue("title"))) > 0 {
		story.Title = strings.TrimSpace(r.FormValue("title"))
		if story.Title == "" {
			RespondWithError(w, http.StatusBadRequest, "Missing story name")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("description"))) > 0 {
		story.Description = strings.TrimSpace(r.FormValue("description"))
		if story.Description == "" {
			RespondWithError(w, http.StatusBadRequest, "Missing story description")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("series_id"))) > 0 {
		story.SeriesID = strings.TrimSpace(r.FormValue("series_id"))
	} else if len(strings.TrimSpace(r.FormValue("series_name"))) > 0 {
		story.SeriesID = strings.TrimSpace(r.FormValue("series_name"))
	} else {
		story.SeriesID = ""
	}

	const maxFileSize = 1024 * 1024 // 1 MB
	// image upload
	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		if err != http.ErrMissingFile {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if file != nil {
		// TODO delete previous image
		defer file.Close()

		allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
		if handler.Size < 0 || handler.Size > int64(maxFileSize) {
			RespondWithError(w, http.StatusBadRequest, "File is too large")
			return
		}
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
		if scaledImageBuf.Len() > maxFileSize {
			RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
			return
		}

		ext := filepath.Ext(handler.Filename)

		safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		filename := safeEmail + "_" + storyID + ext

		var awsCfg aws.Config
		if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
			opts.Region = os.Getenv("AWS_REGION")
			return nil
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s3Client := s3.NewFromConfig(awsCfg)
		if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket:      aws.String(S3_STORY_IMAGE_BUCKET),
			Key:         aws.String(filename),
			Body:        scaledImageBuf,
			ContentType: aws.String(fileType),
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		story.ImageURL = "https://" + S3_STORY_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	}

	var updatedStory models.Story
	if updatedStory, err = dao.EditStory(email, *story); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, updatedStory)
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
	if err := decoder.Decode(&updateSettings); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = dao.UpdateStorySettings(email, storyID, updateSettings)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, updateSettings)
}
