package api

import (
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func StoryBlocksEndPoint(w http.ResponseWriter, r *http.Request) {
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

	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("story-place-index"),
		KeyConditionExpression: aws.String("#place>:p AND story=:s"),
		ExpressionAttributeNames: map[string]string{
			"#place": "place",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":s": &types.AttributeValueMemberS{
				Value: story,
			},
		},
	}

	if startKey != "" {
		queryInput.ExclusiveStartKey = map[string]types.AttributeValue{
			"keyID": &types.AttributeValueMemberS{Value: startKey},
		}
	}

	var items []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(AwsClient, queryInput)

	var lastKey map[string]types.AttributeValue
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			if opErr, ok := err.(*smithy.OperationError); ok {
				var notFoundErr *types.ResourceNotFoundException
				if errors.As(opErr.Unwrap(), &notFoundErr) {
					RespondWithError(w, http.StatusNotFound, err.Error())
					return
				}
			}
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if page.LastEvaluatedKey != nil {
			lastKey = page.LastEvaluatedKey
		}
		items = append(items, page.Items...)
	}
	blocks := BlocksData{
		Items:         items,
		LastEvaluated: lastKey,
	}
	if len(items) == 0 {
		RespondWithError(w, http.StatusNotFound, "no blocks for this title and chapter")
		return
	}
	RespondWithJson(w, http.StatusOK, blocks)
}

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
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_title=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: story},
		},
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	storyObj := []Story{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &storyObj); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fmt.Println("stories", storyObj)
	var outChaps *dynamodb.QueryOutput
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("chapters"),
		IndexName:              aws.String("story_title-chapter_num-index"),
		KeyConditionExpression: aws.String("chapter_num > :cn AND story_title=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cn": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":s": &types.AttributeValueMemberS{
				Value: story,
			},
		},
	}

	if outChaps, err = AwsClient.Query(context.TODO(), queryInput); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	chapters := []Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(outChaps.Items, &chapters); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	storyObj[0].Chapters = chapters
	RespondWithJson(w, http.StatusOK, storyObj[0])
}

func AllStandaloneStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
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
		FilterExpression: aws.String("author=:eml AND series=:f"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":f":   &types.AttributeValueMemberBOOL{Value: false},
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

	var outChaps *dynamodb.QueryOutput
	for i := 0; i < len(stories); i++ {
		queryInput := &dynamodb.QueryInput{
			TableName:              aws.String("chapters"),
			IndexName:              aws.String("story_title-chapter_num-index"),
			KeyConditionExpression: aws.String("chapter_num > :cn AND story_title=:s"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":cn": &types.AttributeValueMemberN{
					Value: "-1",
				},
				":s": &types.AttributeValueMemberS{
					Value: stories[i].Title,
				},
			},
		}

		if outChaps, err = AwsClient.Query(context.TODO(), queryInput); err != nil {
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
		FilterExpression: aws.String("author=:eml AND story=:s"),
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

	var series *dynamodb.QueryOutput
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("series"),
		IndexName:              aws.String("author-place-index"),
		KeyConditionExpression: aws.String("place > :p AND author=:eml"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	if series, err = AwsClient.Query(context.TODO(), queryInput); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, series)
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
