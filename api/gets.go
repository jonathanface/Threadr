package api

import (
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	/*
		startKey := r.URL.Query().Get("key")
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
		tableIndex := email + "_" + story
		email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		safeStory := strings.ToLower(strings.ReplaceAll(story, " ", "-"))
		tableName := email + "_" + safeStory + "_chapter_" + "_blocks"

		input := dynamodb.ScanInput{
			TableName:        aws.String("blocks"),
			FilterExpression: aws.String("contains(key_id, :ind) AND contains(story, :stry)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":ind":  &types.AttributeValueMemberS{Value: tableIndex},
				":stry": &types.AttributeValueMemberS{Value: story},
			},
		}
		if startKey != "" {
			input.ExclusiveStartKey = map[string]types.AttributeValue{
				"keyID": &types.AttributeValueMemberS{Value: startKey},
				"story": &types.AttributeValueMemberS{Value: story},
			}
		}
		out, err := AwsClient.Scan(context.TODO(), &input)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		fmt.Println("got back", out.LastEvaluatedKey, out.ScannedCount, out)
		type BlocksData struct {
			LastEvaluated map[string]types.AttributeValue   `json:"last_evaluated_key"`
			ScannedCount  int32                             `json:"scanned_count"`
			Items         []map[string]types.AttributeValue `json:"items"`
		}
		blocks := BlocksData{
			LastEvaluated: out.LastEvaluatedKey,
			ScannedCount:  out.ScannedCount,
			Items:         out.Items,
		}*/
	RespondWithJson(w, http.StatusOK, nil)
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

	var outChaps *dynamodb.ScanOutput
	for i := 0; i < len(stories); i++ {
		chapterKey := email + "_" + stories[i].Title
		if outChaps, err = AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("chapters"),
			FilterExpression: aws.String("contains(key_id, :ck)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":ck": &types.AttributeValueMemberS{Value: chapterKey},
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
