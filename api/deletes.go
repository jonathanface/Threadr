package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func DeleteBlockFromStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
	var blockKey struct {
		KeyID string `json:"keyID"`
	}
	if err := decoder.Decode(&blockKey); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	_, err = AwsClient.DeleteItem(context.TODO(), &dynamodb.DeleteItemInput{
		TableName: aws.String("blocks"),
		Key: map[string]types.AttributeValue{
			"keyID": &types.AttributeValueMemberS{Value: blockKey.KeyID},
			"story": &types.AttributeValueMemberS{Value: story},
		},
		ConditionExpression: aws.String("contains(author, :eml)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, nil)
}
