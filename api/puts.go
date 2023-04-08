package api

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
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
			rand.Seed(time.Now().UnixNano())
			var imgFile string
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
				UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), story=:s, association_type=:at, case_sensitive=:c, portrait=:p, short_description=:sd"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t":  &types.AttributeValueMemberN{Value: now},
					":at": &types.AttributeValueMemberS{Value: item.Type},
					":c":  &types.AttributeValueMemberBOOL{Value: true},
					":s":  &types.AttributeValueMemberS{Value: story},
					":p":  &types.AttributeValueMemberS{Value: imgFile},
					":sd": &types.AttributeValueMemberS{Value: "You may edit this descriptive text by clicking on the association."},
				},
			}

			updateDetailsInput := &types.Update{
				TableName:        aws.String("association_details"),
				Key:              key,
				UpdateExpression: aws.String("set story=:s, description=:d, extended_description=:ed"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s":  &types.AttributeValueMemberS{Value: story},
					":d":  &types.AttributeValueMemberS{Value: "Here you can put a basic description.\nShift+Enter for new lines."},
					":ed": &types.AttributeValueMemberS{Value: "Here you can put some extended details.\nShift+Enter for new lines."},
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
