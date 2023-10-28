package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"bytes"
	"context"
	"encoding/json"
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

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}

	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if err = dao.ResetBlockOrder(email, story, &storyBlocks); err != nil {
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

func WriteBlocksToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email        string
		err          error
		story        string
		dao          daos.DaoInterface
		ok           bool
		subscriberID string
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err = decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if subscriberID, err = dao.IsUserSubscribed(email); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to retrieve user subscription status")
		return
	}
	if subscriberID == "" {
		blocks, err := dao.GetStoryParagraphs(email, story, "1", "")
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "unable to retrieve story block count")
			return
		}
		if len(blocks.Items) >= MAX_UNSUBSCRIBED_BLOCK_COUNT {
			RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
			return
		}
	}

	if err = dao.WriteBlocks(email, story, &storyBlocks); err != nil {
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

func WriteAssocationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}
	if err = decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	storyOrSeries := story
	if storyOrSeries, err = dao.IsStoryInASeries(email, story); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to check series membership of story")
		return
	}

	if err = dao.WriteAssociations(email, storyOrSeries, associations); err != nil {
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
	RespondWithJson(w, http.StatusOK, associations)
}

func UploadPortraitEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email           string
		err             error
		story           string
		associationName string
		associationType string
		dao             daos.DaoInterface
		ok              bool
		awsCfg          aws.Config
	)
	const maxFileSize = 1024 * 1024 // 1 MB
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if associationName, err = url.PathUnescape(mux.Vars(r)["association"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association name")
		return
	}
	if associationName == "" {
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

	storyOrSeries := story
	if storyOrSeries, err = dao.IsStoryInASeries(email, story); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	reader := bytes.NewReader(fileBytes)
	ext := filepath.Ext(handler.Filename)
	safeStory := strings.ToLower(strings.ReplaceAll(storyOrSeries, " ", "-"))
	safeAssoc := strings.ToLower(strings.ReplaceAll(associationName, " ", "-"))
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	filename := safeEmail + "_" + safeStory + "_" + safeAssoc + "_" + associationType + ext

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
		Body:        reader,
		ContentType: aws.String(fileType),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	portraitURL := "https://" + S3_CUSTOM_PORTRAIT_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if err = dao.UpdateAssociationPortraitEntryInDB(email, storyOrSeries, associationName, portraitURL); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJson(w, http.StatusOK, models.Answer{Success: true, URL: portraitURL})
}
