package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Story struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Series      string `json:"series"`
	Place       int    `json:"place"`
}

func CreateStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	decoder := json.NewDecoder(r.Body)
	story := Story{}
	if err := decoder.Decode(&story); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	story.Title = strings.TrimSpace(story.Title)
	if story.Title == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	story.Description = strings.TrimSpace(story.Description)
	if story.Description == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story description")
		return
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	if len(story.Series) > 0 {
		if story.Place <= 0 {
			RespondWithError(w, http.StatusBadRequest, "Place must be > 0")
			return
		}
		log.Println("creating series", story.Series)
		input := &dynamodb.UpdateItemInput{
			TableName: aws.String("series"),
			Key: map[string]types.AttributeValue{
				"title":  &types.AttributeValueMemberS{Value: story.Series},
				"author": &types.AttributeValueMemberS{Value: email},
			},
			UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), story_count=if_not_exists(story_count, :initIncr) + :incr"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":t":        &types.AttributeValueMemberN{Value: now},
				":incr":     &types.AttributeValueMemberN{Value: "1"},
				":initIncr": &types.AttributeValueMemberN{Value: "0"},
			},
		}
		if _, err = AwsClient.UpdateItem(context.TODO(), input); err != nil {
			fmt.Println("series err", err)
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	place := strconv.Itoa(story.Place)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("stories"),
		Key: map[string]types.AttributeValue{
			"title":  &types.AttributeValueMemberS{Value: story.Title},
			"author": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression:    aws.String("set description=:descr, series=:srs, place=:p, created_at=:t"),
		ConditionExpression: aws.String("author <> :eml AND #title <> :title"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t":     &types.AttributeValueMemberN{Value: now},
			":descr": &types.AttributeValueMemberS{Value: story.Description},
			":srs":   &types.AttributeValueMemberS{Value: story.Series},
			":p":     &types.AttributeValueMemberN{Value: place},
			":eml":   &types.AttributeValueMemberS{Value: email},
			":title": &types.AttributeValueMemberS{Value: story.Title},
		},
		ExpressionAttributeNames: map[string]string{
			"#title": "title",
		},
	}
	if _, err = AwsClient.UpdateItem(context.TODO(), input); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
}
