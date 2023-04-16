package api

import (
	"bytes"
	"context"
	"encoding/json"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gorilla/mux"
)

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		story      string
		awsStatus  int
		awsMessage string
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
	storyBlocks := StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"
	// Group the storyBlocks into batches of 50.
	batches := make([][]StoryBlock, 0, (len(storyBlocks.Blocks)+(writeBatchSize-1))/writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += writeBatchSize {
		end := i + writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}
		awsStatus, awsMessage = awsWriteTransaction(writeItemsInput)
		if awsStatus != http.StatusOK {
			RespondWithError(w, awsStatus, awsMessage)
			return
		}
	}

	type answer struct {
		Success     bool `json:"success"`
		NumberWrote int  `json:"wrote"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true})
}

func WriteBlocksToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		story      string
		awsStatus  int
		awsMessage string
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
	storyBlocks := StoryBlocks{}
	if err = decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	emailSafe := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := emailSafe + "_" + safeStory + "_" + chapter + "_blocks"

	// Group the storyBlocks into batches of 50.
	batches := make([][]StoryBlock, 0, (len(storyBlocks.Blocks)+(writeBatchSize-1))/writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += writeBatchSize {
		end := i + writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}
	numWrote := 0
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set chunk=:c, story=:s, place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":c": &types.AttributeValueMemberS{Value: string(item.Chunk)},
					":s": &types.AttributeValueMemberS{Value: story},
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}
		awsStatus, awsMessage = awsWriteTransaction(writeItemsInput)
		if awsStatus != http.StatusOK {
			RespondWithError(w, awsStatus, awsMessage)
			return
		}
		numWrote += len(batch)
	}

	type answer struct {
		Success     bool `json:"success"`
		NumberWrote int  `json:"wrote"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, NumberWrote: len(storyBlocks.Blocks)})
}

func WriteAssocationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		story      string
		awsStatus  int
		awsMessage string
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
	associations := []Association{}
	if err = decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Group the storyBlocks into batches of 50.
	batches := make([][]Association, 0, (len(associations)+(writeBatchSize-1))/writeBatchSize)
	for i := 0; i < len(associations); i += writeBatchSize {
		end := i + writeBatchSize
		if end > len(associations) {
			end = len(associations)
		}
		batches = append(batches, associations[i:end])
	}

	now := strconv.FormatInt(time.Now().Unix(), 10)
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		writeItemsDetailsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			imgFile := item.Portrait
			if imgFile == "" {
				rand.Seed(time.Now().UnixNano())
				switch item.Type {
				case "character":
					imageFileName := rand.Intn(MAX_DEFAULT_PORTRAIT_IMAGES-1) + 1
					imgFile = S3_PORTRAIT_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				case "place":
					imageFileName := rand.Intn(MAX_DEFAULT_LOCATION_IMAGES-1) + 1
					imgFile = S3_LOCATION_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				case "event":
					imageFileName := rand.Intn(MAX_DEFAULT_EVENT_IMAGES-1) + 1
					imgFile = S3_EVENT_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				}
			}
			shortDescription := item.ShortDescription
			if shortDescription == "" {
				shortDescription = "You may edit this descriptive text by clicking on the association."
			}
			extendedDescription := item.Details.ExtendedDescription
			if extendedDescription == "" {
				extendedDescription = "Here you can put some extended details.\nShift+Enter for new lines."
			}
			associations[i].Portrait = imgFile
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_name": &types.AttributeValueMemberS{Value: item.Name},
				"author":           &types.AttributeValueMemberS{Value: email},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String("associations"),
				Key:              key,
				UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), story=:s, association_type=:at, portrait=:p, short_description=:sd"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t":  &types.AttributeValueMemberN{Value: now},
					":at": &types.AttributeValueMemberS{Value: item.Type},
					":s":  &types.AttributeValueMemberS{Value: story},
					":p":  &types.AttributeValueMemberS{Value: imgFile},
					":sd": &types.AttributeValueMemberS{Value: shortDescription},
				},
			}

			updateDetailsInput := &types.Update{
				TableName:        aws.String("association_details"),
				Key:              key,
				UpdateExpression: aws.String("set story=:s, case_sensitive=:c, extended_description=:ed"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s":  &types.AttributeValueMemberS{Value: story},
					":c":  &types.AttributeValueMemberBOOL{Value: item.Details.CaseSensitive},
					":ed": &types.AttributeValueMemberS{Value: extendedDescription},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}
			writeDetailsItem := types.TransactWriteItem{
				Update: updateDetailsInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
			writeItemsDetailsInput.TransactItems[i] = writeDetailsItem
		}
		awsStatus, awsMessage = awsWriteTransaction(writeItemsInput)
		if awsStatus != http.StatusOK {
			RespondWithError(w, awsStatus, awsMessage)
			return
		}
		awsStatus, awsMessage = awsWriteTransaction(writeItemsDetailsInput)
		if awsStatus != http.StatusOK {
			RespondWithError(w, awsStatus, awsMessage)
			return
		}
	}
	RespondWithJson(w, http.StatusOK, associations)
}

func UploadPortraitEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email           string
		err             error
		story           string
		association     string
		associationType string
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
	if association, err = url.PathUnescape(mux.Vars(r)["association"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association name")
		return
	}
	if association == "" {
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
	allowedTypes := []string{"image/jpeg", "image/png"}
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

	ext := filepath.Ext(handler.Filename)
	safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	safeAssoc := strings.ToLower(strings.ReplaceAll(association, " ", "-"))
	filename := safeStory + "_" + safeAssoc + "_" + associationType + ext
	reader := bytes.NewReader(fileBytes)

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	_, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_CUSTOM_PORTRAIT_BUCKET),
		Key:         aws.String(filename),
		Body:        reader,
		ContentType: aws.String(fileType),
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	url := "https://" + S3_CUSTOM_PORTRAIT_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	key := map[string]types.AttributeValue{
		"association_name": &types.AttributeValueMemberS{Value: association},
		"author":           &types.AttributeValueMemberS{Value: email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("associations"),
		Key:              key,
		UpdateExpression: aws.String("set portrait=:p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberS{Value: url},
		},
	}
	_, err = AwsClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	type answer struct {
		Success bool   `json:"success"`
		URL     string `json:"url"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, URL: url})
}
