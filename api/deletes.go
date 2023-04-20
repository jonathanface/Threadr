package api

import (
	"RichDocter/models"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func DeleteBlocksFromStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
	storyBlocks := models.StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"
	fmt.Println("deleting from", tableName)

	// Group the storyBlocks into batches of 25.
	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+24)/25)
	for i := 0; i < len(storyBlocks.Blocks); i += 25 {
		end := i + 25
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

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String(tableName),
			}
			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
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
		NumberWrote int  `json:"deleted"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, NumberWrote: len(storyBlocks.Blocks)})
}

func DeleteAssociationsEndpoint(w http.ResponseWriter, r *http.Request) {
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
	associations := []models.Association{}

	if err := decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Group the storyBlocks into batches of 25.
	batches := make([][]models.Association, 0, (len(associations)+24)/25)
	for i := 0; i < len(associations); i += 25 {
		end := i + 25
		if end > len(associations) {
			end = len(associations)
		}
		batches = append(batches, associations[i:end])
	}

	numWrote := 0

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
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_name": &types.AttributeValueMemberS{Value: item.Name},
				"author":           &types.AttributeValueMemberS{Value: email},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("associations"),
				ConditionExpression: aws.String("story=:s AND association_type=:t"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s": &types.AttributeValueMemberS{Value: story},
					":t": &types.AttributeValueMemberS{Value: item.Type},
				},
			}
			fmt.Println("story", story)
			deleteDetailsInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("association_details"),
				ConditionExpression: aws.String("story=:s"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s": &types.AttributeValueMemberS{Value: story},
				},
			}
			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}
			writeDetailsItem := types.TransactWriteItem{
				Delete: deleteDetailsInput,
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
		numWrote += len(batch)
	}

	type answer struct {
		Success     bool `json:"success"`
		NumberWrote int  `json:"deleted"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, NumberWrote: len(associations)})
}

func DeleteChaptersEndpoint(w http.ResponseWriter, r *http.Request) {
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
	chapters := []models.Chapter{}

	if err := decoder.Decode(&chapters); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	tblEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	tblStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))

	// Group the storyBlocks into batches of 25.
	batches := make([][]models.Chapter, 0, (len(chapters)+24)/25)
	for i := 0; i < len(chapters); i += 25 {
		end := i + 25
		if end > len(chapters) {
			end = len(chapters)
		}
		batches = append(batches, chapters[i:end])
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
				"chapter_title": &types.AttributeValueMemberS{Value: item.ChapterTitle},
				"story_title":   &types.AttributeValueMemberS{Value: story},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("chapters"),
				ConditionExpression: aws.String("author=:eml"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem

			chapter := strconv.Itoa(item.ChapterNum)
			tableName := tblEmail + "_" + tblStory + "_" + chapter + "_blocks"

			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(tableName),
			}

			// Delete the table
			_, err = AwsClient.DeleteTable(context.Background(), deleteTableInput)
			if err != nil {
				fmt.Println("error deleting table:", tableName, err)
			}
		}
		awsStatus, awsMessage = awsWriteTransaction(writeItemsInput)
		if awsStatus != http.StatusOK {
			RespondWithError(w, awsStatus, awsMessage)
			return
		}
	}

	type answer struct {
		Success     bool `json:"success"`
		NumberWrote int  `json:"deleted"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, NumberWrote: len(chapters)})
}
