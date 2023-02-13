package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

type StoryBlock struct {
	Key   string          `json:"key"`
	Block json.RawMessage `json:"block"`
	Order string          `json:"order"`
}

func WriteToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
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
	storyBlock := StoryBlock{}
	var jsonStr string
	json.Unmarshal([]byte(jsonStr), &r.Body)
	if err := decoder.Decode(&storyBlock); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("blocks"),
		Key: map[string]types.AttributeValue{
			"key":   &types.AttributeValueMemberS{Value: storyBlock.Key},
			"story": &types.AttributeValueMemberS{Value: story},
		},
		UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), #owner=:e, #block=:b, #order=:o"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
			":b": &types.AttributeValueMemberS{Value: string(storyBlock.Block)},
			":e": &types.AttributeValueMemberS{Value: email},
			":o": &types.AttributeValueMemberN{Value: storyBlock.Order},
		},
		ExpressionAttributeNames: map[string]string{
			"#order": "order",
			"#owner": "owner",
			"#block": "block",
		},
	}
	if _, err = AwsClient.UpdateItem(context.TODO(), input); err != nil {
		fmt.Println("block write err", err)
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
}
