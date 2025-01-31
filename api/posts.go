package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

func AnalyzeChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err            error
		storyID        string
		chapterID      string
		dao            daos.DaoInterface
		ok             bool
		typeOfAnalysis string
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter ID")
		return
	}
	if typeOfAnalysis, err = url.PathUnescape(mux.Vars(r)["type"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing analysis type")
		return
	}
	if typeOfAnalysis == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing analysis type")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	blocks, err := staggeredStoryBlockRetrieval(dao, storyID, chapterID, nil, nil)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	chapterText := ""
	for _, block := range blocks.Items {
		chunkAttributeValue, ok := block["chunk"].(*types.AttributeValueMemberS)
		if !ok {
			fmt.Println("Chunk attribute is not a string; unable to unmarshal.")
			continue // Skip this item or handle the error as appropriate
		}
		chk := models.Chunk{}
		err := json.Unmarshal([]byte(chunkAttributeValue.Value), &chk)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		chapterText += chk.Text
	}
	if chapterText == "" {
		RespondWithError(w, http.StatusUnprocessableEntity, "Cannot process chapter")
		return
	}
	openAIKey := os.Getenv("OPENAI_API_KEY")
	url := "https://api.openai.com/v1/chat/completions"

	//A helpful rule of thumb is that one token generally corresponds to ~4 characters of text for common English text. This translates to roughly ¾ of a word (so 100 tokens ~= 75 words).

	var instructions, content string
	switch typeOfAnalysis {
	case "analyze":
		{
			instructions = "You are a story editor, skilled in explaining complex narrative formulas and detecting story flaws."
			content = "Evaluate the following story chapter in less than 300 words, considering that it may be an unfinished sample or a work in progress: " + chapterText
		}
	case "propose":
		{
			instructions = "You are a story outliner, skilled in crafting compelling plots with interesting characters and twists."
			content = "Provide some options of what should happen next in the following unfinished story chapter in less than 300 words: " + chapterText
		}
	}
	// Data structure that matches the JSON payload structure of the request
	payload := map[string]interface{}{
		"model": "gpt-3.5-turbo",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": instructions,
			},
			{
				"role":    "user",
				"content": content,
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create a new HTTP request with the appropriate method, URL, and payload
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("bad gateway from openAI request", err)
		RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+openAIKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		RespondWithError(w, http.StatusBadGateway, err.Error())
		return
	}
	fmt.Println("str", string(body))
	var response models.OpenAIResponse
	err = json.Unmarshal(body, &response)
	if err != nil {
		// Handle error
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(response.Choices) > 0 && response.Choices[0].Message.Content != "" {
		RespondWithJson(w, http.StatusOK, response.Choices[0].Message)
	} else {
		RespondWithError(w, http.StatusNoContent, "invalid response from gpt")
	}
}

func CreateStoryChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		err        error
		storyID    string
		dao        daos.DaoInterface
		ok         bool
		newChapter models.Chapter
		email      string
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
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
	chapter.ID = uuid.New().String()
	if chapter.Place == 0 {
		chapter.Place = 1
	}

	if newChapter, err = dao.CreateChapter(storyID, chapter, email); err != nil {
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
	RespondWithJson(w, http.StatusOK, newChapter)
}

func CreateAssociationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}

	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}
	if err = decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	for idx, assoc := range associations {
		if assoc.ID == "" {
			associations[idx].ID = uuid.New().String()
		}
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(email, storyID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to check series membership of story")
		return
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}
	if err = dao.WriteAssociations(email, storyOrSeriesID, associations); err != nil {
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

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	story := models.Story{}
	story.ID = uuid.New().String()
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_STORY_IMAGE_BUCKET),
		Key:         aws.String(filename),
		Body:        bytes.NewReader(scaledImageBuf.Bytes()),
		ContentType: aws.String(fileType),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	story.ImageURL = "https://" + S3_STORY_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if story.ID, err = dao.CreateStory(email, story, seriesTitle); err != nil {
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

	firstChapterID := uuid.New().String()
	chap := models.Chapter{}
	chap.ID = firstChapterID
	chap.Title = "Chapter 1"
	chap.Place = 1
	newChapter, err := dao.CreateChapter(story.ID, chap, email)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	story.Chapters = append(story.Chapters, newChapter)
	RespondWithJson(w, http.StatusOK, story)
}
