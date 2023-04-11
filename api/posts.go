package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

func generateStoryChapterTransaction(email string, story string, chapter int, chapterTitle string) (types.TransactWriteItem, error) {
	if email == "" || story == "" || chapterTitle == "" {
		return types.TransactWriteItem{}, fmt.Errorf("CHAPTER CREATION: Email, story, and chapterTitle params must not be blank")
	}
	chapterNumStr := strconv.Itoa(chapter)

	input := types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String("chapters"),
			Key: map[string]types.AttributeValue{
				"chapter_title": &types.AttributeValueMemberS{Value: chapterTitle},
				"story_title":   &types.AttributeValueMemberS{Value: story},
			},
			ConditionExpression: aws.String("attribute_not_exists(series_title) AND attribute_not_exists(story_title)"),
			UpdateExpression:    aws.String("set chapter_num=:n, author=:a"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: chapterNumStr},
				":a": &types.AttributeValueMemberS{Value: email},
			},
		},
	}
	return input, nil
}

func createBlockTable(email string, story string, chapterTitle string, chapterNum int) error {
	if email == "" || story == "" || chapterTitle == "" {
		return fmt.Errorf("BLOCKS TABLE CREATION: Email, story, and chapter params must not be blank")
	}
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	story = strings.ToLower(strings.ReplaceAll(story, " ", "-"))
	chapter := strconv.Itoa(chapterNum)
	tableName := email + "_" + story + "_" + chapter + "_blocks"
	fmt.Println("attempting to create", tableName)
	partitionKey := aws.String("key_id")
	gsiPartKey := aws.String("story")
	gsiSortKey := aws.String("place")

	tableSchema := []types.KeySchemaElement{
		{
			AttributeName: partitionKey,
			KeyType:       types.KeyTypeHash,
		},
	}

	gsiSchema := []types.KeySchemaElement{
		{
			AttributeName: gsiPartKey,
			KeyType:       types.KeyTypeHash,
		},
		{
			AttributeName: gsiSortKey,
			KeyType:       types.KeyTypeRange,
		},
	}

	attributes := []types.AttributeDefinition{
		{
			AttributeName: partitionKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiPartKey,
			AttributeType: types.ScalarAttributeTypeS,
		},
		{
			AttributeName: gsiSortKey,
			AttributeType: types.ScalarAttributeTypeN,
		},
	}

	gsiSettings := []types.GlobalSecondaryIndex{
		{
			IndexName: aws.String("story-place-index"),
			KeySchema: gsiSchema,
			Projection: &types.Projection{
				ProjectionType: types.ProjectionTypeAll,
			},
		},
	}

	_, err := AwsClient.CreateTable(context.TODO(), &dynamodb.CreateTableInput{
		TableName:              aws.String(tableName),
		KeySchema:              tableSchema,
		AttributeDefinitions:   attributes,
		BillingMode:            types.BillingModePayPerRequest,
		GlobalSecondaryIndexes: gsiSettings,
	})

	if err != nil {
		return err
	} else {
		waiter := dynamodb.NewTableExistsWaiter(AwsClient)
		if err = waiter.Wait(context.TODO(), &dynamodb.DescribeTableInput{
			TableName: aws.String(tableName),
		}, 1*time.Minute); err != nil {
			return err
		}
	}
	return nil
}

func CreateStoryChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
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
	chapter := Chapter{}
	if err := decoder.Decode(&chapter); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var chapTwi types.TransactWriteItem
	if chapTwi, err = generateStoryChapterTransaction(email, story, chapter.ChapterNum, chapter.ChapterTitle); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	twii := &dynamodb.TransactWriteItemsInput{}
	var code int
	var awsError string
	twii.TransactItems = append(twii.TransactItems, chapTwi)
	if code, awsError = awsWriteTransaction(twii); awsError != "" {
		RespondWithError(w, code, awsError)
		return
	}
	if err = createBlockTable(email, story, chapter.ChapterTitle, chapter.ChapterNum); err != nil {
		var riu *types.ResourceInUseException
		if errors.As(err, &riu) {
			RespondWithError(w, http.StatusConflict, "story or story with chapter already exists")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusCreated, nil)
}

func CreateStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
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
	twii := &dynamodb.TransactWriteItemsInput{}
	if len(story.Series) > 0 {
		if story.Place <= 0 {
			RespondWithError(w, http.StatusBadRequest, "Place must be > 0")
			return
		}
		log.Println("creating series", story.Series)
		twi := types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String("series"),
				Key: map[string]types.AttributeValue{
					"series_title": &types.AttributeValueMemberS{Value: story.Series},
					"author":       &types.AttributeValueMemberS{Value: email},
				},
				//ConditionExpression: aws.String("attribute_not_exists(series_title)"),
				UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), story_count=if_not_exists(story_count, :initIncr) + :incr"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t":        &types.AttributeValueMemberN{Value: now},
					":incr":     &types.AttributeValueMemberN{Value: "1"},
					":initIncr": &types.AttributeValueMemberN{Value: "0"},
				},
			},
		}
		twii.TransactItems = append(twii.TransactItems, twi)
	}
	place := strconv.Itoa(story.Place)
	twi := types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String("stories"),
			Key: map[string]types.AttributeValue{
				"story_title": &types.AttributeValueMemberS{Value: story.Title},
				"author":      &types.AttributeValueMemberS{Value: email},
			},
			ConditionExpression: aws.String("attribute_not_exists(story_title)"),
			UpdateExpression:    aws.String("set description=:descr, series=:srs, place_in_series=:p"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":descr": &types.AttributeValueMemberS{Value: story.Description},
				":srs":   &types.AttributeValueMemberS{Value: story.Series},
				":p":     &types.AttributeValueMemberN{Value: place},
			},
		},
	}
	twii.TransactItems = append(twii.TransactItems, twi)

	var chapTwi types.TransactWriteItem
	if chapTwi, err = generateStoryChapterTransaction(email, story.Title, 1, "Chapter 1"); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	twii.TransactItems = append(twii.TransactItems, chapTwi)

	var code int
	var awsError string
	if code, awsError = awsWriteTransaction(twii); awsError != "" {
		RespondWithError(w, code, awsError)
		return
	}
	if err = createBlockTable(email, story.Title, "Chapter 1", 1); err != nil {
		var riu *types.ResourceInUseException
		if errors.As(err, &riu) {
			RespondWithError(w, http.StatusConflict, "story or story with chapter already exists")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJson(w, http.StatusCreated, nil)
}
