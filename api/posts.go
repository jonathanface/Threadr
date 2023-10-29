package api

import (
	"RichDocter/converters"
	"RichDocter/daos"
	"RichDocter/models"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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

func CreateStoryChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email      string
		err        error
		storyTitle string
		dao        daos.DaoInterface
		ok         bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyTitle, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	decoder := json.NewDecoder(r.Body)
	chapter := models.Chapter{}
	if err := decoder.Decode(&chapter); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if err = dao.CreateChapter(email, storyTitle, chapter); err != nil {
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
	RespondWithJson(w, http.StatusOK, nil)
}

func CreateStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer file.Close()

	if handler.Size > maxFileSize {
		RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
		return
	}
	allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileType := http.DetectContentType(fileBytes)
	fmt.Println("filetype", fileType)
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

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	story := models.Story{}
	story.Title = strings.TrimSpace(r.FormValue("title"))
	if story.Title == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	story.Description = strings.TrimSpace(r.FormValue("description"))
	if story.Description == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story description")
		return
	}

	reader := bytes.NewReader(fileBytes)
	ext := filepath.Ext(handler.Filename)

	safeStory := strings.ToLower(strings.ReplaceAll(story.Title, " ", "-"))
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	filename := safeEmail + "_" + safeStory + ext

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
		Body:        reader,
		ContentType: aws.String(fileType),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	story.PortraitURL = "https://" + S3_STORY_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if err = dao.CreateStory(email, story); err != nil {
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
	RespondWithJson(w, http.StatusOK, nil)
}

func ExportStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	decoder := json.NewDecoder(r.Body)
	export := models.DocumentExportRequest{}
	if err := decoder.Decode(&export); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	storyTitle := strings.TrimSpace(export.StoryTitle)
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Make sure the user actually owns this story
	_, err = dao.GetStoryByName(email, storyTitle)
	if err != nil {
		if err == sql.ErrNoRows {
			RespondWithError(w, http.StatusForbidden, "story doesn't belong to you")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filetype := "application/pdf"
	var awsCfg aws.Config
	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var generatedFile string
	switch export.Type {
	case "pdf":
		generatedFile, err = converters.HTMLToPDF(export)
	case "docx":
		generatedFile, err = converters.HTMLToDOCX(export)
	}
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove(TMP_EXPORT_DIR + "/" + generatedFile)

	reader, err := os.Open(TMP_EXPORT_DIR + "/" + generatedFile)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_EXPORTS_BUCKET),
		Key:         aws.String(generatedFile),
		Body:        reader,
		ContentType: aws.String(filetype),
		/*		Metadata: map[string]string{
				"Content-Disposition": "attachment; filename=" + generatedFile,
			},*/
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	docURL := "https://" + S3_EXPORTS_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + generatedFile
	RespondWithJson(w, http.StatusCreated, models.Answer{Success: true, URL: docURL})
}
