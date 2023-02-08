package api

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	userID := os.Getenv("USER_ID")
	if userID == "" {
		RespondWithError(w, http.StatusUnprocessableEntity, "user id not set")
	}
	storyID := mux.Vars(r)["storyID"]
	fmt.Println("storyid", storyID)
	out, err := AwsClient.GetItem(context.TODO(), &dynamodb.GetItemInput{
		TableName: aws.String("stories"),
		Key: map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: storyID},
			"user_id":  &types.AttributeValueMemberS{Value: userID},
		},
	})

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, out.Item)
}

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {

	var (
		email string
		err   error
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND contains(#owner, :eml)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
		ExpressionAttributeNames: map[string]string{
			"#owner": "owner",
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, out.Items)
}
