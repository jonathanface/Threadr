package api

import (
	"context"
	"net/http"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
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
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	out, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("blocks"),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND contains(author, :eml) AND contains(story, :stry)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml":  &types.AttributeValueMemberS{Value: email},
			":stry": &types.AttributeValueMemberS{Value: story},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, out.Items)
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
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND contains(author, :eml)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, out.Items)
}

func AllSeriesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("series"),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND contains(author, :eml)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, out.Items)
}
