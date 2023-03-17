package api

import (
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	startKey := r.URL.Query().Get("key")
	chapter := r.URL.Query().Get("chapter")
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
	if chapter == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter number")
		return
	}
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"

	input := dynamodb.ScanInput{
		TableName: aws.String(tableName),
	}
	if startKey != "" {
		input.ExclusiveStartKey = map[string]types.AttributeValue{
			"keyID": &types.AttributeValueMemberS{Value: startKey},
		}
	}
	out, err := AwsClient.Scan(context.TODO(), &input)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	blocks := BlocksData{
		LastEvaluated: out.LastEvaluatedKey,
		ScannedCount:  out.ScannedCount,
		Items:         out.Items,
	}
	RespondWithJson(w, http.StatusOK, blocks)
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
	//todo transactionify
	out, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("contains(author, :eml)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	stories := []Story{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fmt.Println("stories", stories)

	var outChaps *dynamodb.ScanOutput
	for i := 0; i < len(stories); i++ {
		if outChaps, err = AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("chapters"),
			FilterExpression: aws.String("contains(story_title, :ck) AND contains(author, :eml)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":ck":  &types.AttributeValueMemberS{Value: stories[i].Title},
				":eml": &types.AttributeValueMemberS{Value: email},
			},
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		chapters := []Chapter{}
		if err = attributevalue.UnmarshalListOfMaps(outChaps.Items, &chapters); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		stories[i].Chapters = chapters
	}
	RespondWithJson(w, http.StatusOK, stories)
}

func AllAssociationsByStoryEndPoint(w http.ResponseWriter, r *http.Request) {
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
		TableName:        aws.String("associations"),
		FilterExpression: aws.String("contains(author, :eml) AND contains(story, :s)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: story},
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

type UserInfo struct {
	Email     string `json:"email"`
	FirstName string `json:"first_name"`
}

func GetUserData(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "token")
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var user UserInfo
	if err = json.Unmarshal(session.Values["token_data"].([]byte), &user); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, user)
}
