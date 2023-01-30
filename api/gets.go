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
	out, err := awsClient.GetItem(context.TODO(), &dynamodb.GetItemInput{
		TableName: aws.String("stories"),
		Key: map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: storyID},
			"user_id":  &types.AttributeValueMemberS{Value: userID},
		},
	})

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
	} else {
		fmt.Println("got", out.Item)
		RespondWithJson(w, http.StatusOK, out.Item)
	}
}

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	userID := os.Getenv("USER_ID")
	if userID == "" {
		RespondWithError(w, http.StatusUnprocessableEntity, "user id not set")
	}

	out, err := awsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("attribute_not_exists(deletedAt) AND contains(user_id, :uid)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
	} else {
		RespondWithJson(w, http.StatusOK, out.Items)
	}
}
