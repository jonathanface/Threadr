package api

import (
	"encoding/json"
	"net/http"
	"net/url"

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
	storyBlocks := []StoryBlock{}

	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Group the storyBlocks into batches of 25.
	batches := make([][]StoryBlock, 0, (len(storyBlocks)+24)/25)
	for i := 0; i < len(storyBlocks); i += 25 {
		end := i + 25
		if end > len(storyBlocks) {
			end = len(storyBlocks)
		}
		batches = append(batches, storyBlocks[i:end])
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
				"keyID": &types.AttributeValueMemberS{Value: item.KeyID},
				"story": &types.AttributeValueMemberS{Value: story},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("blocks"),
				ConditionExpression: aws.String("contains(author, :eml)"),
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
	RespondWithJson(w, http.StatusOK, answer{Success: true, NumberWrote: len(storyBlocks)})
}
