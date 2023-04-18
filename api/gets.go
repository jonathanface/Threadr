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
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(series)"),
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

	outStory, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
	if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &storyObj); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	filterString := "author=:eml AND story=:s"
	expressionValues := map[string]types.AttributeValue{
		":eml": &types.AttributeValueMemberS{Value: email},
		":s":   &types.AttributeValueMemberS{Value: story},
	}
	if storyObj[0].Series != "" {
		outStory, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("author=:eml AND series_title=:srs"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":srs": &types.AttributeValueMemberS{Value: storyObj[0].Series},
			},
		})
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		seriesObj := []Series{}
		if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &seriesObj); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		filterString = "author=:eml AND (story=:s"
		for i, v := range seriesObj {
			idxStr := fmt.Sprint(i)
			filterString += " OR story=:" + idxStr + ""
			expressionValues[":"+idxStr] = &types.AttributeValueMemberS{Value: v.StoryTitle}
		}
		filterString += ")"
	}

	out, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:                 aws.String("associations"),
		FilterExpression:          aws.String(filterString),
		ExpressionAttributeValues: expressionValues,
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	associations := []Association{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &associations); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for i, v := range associations {
		outDetails, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("association_details"),
			FilterExpression: aws.String("author=:eml AND story=:s AND association_name=:n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":s":   &types.AttributeValueMemberS{Value: story},
				":n":   &types.AttributeValueMemberS{Value: v.Name},
			},
		})
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		deets := []AssociationDetails{}
		if err = attributevalue.UnmarshalListOfMaps(outDetails.Items, &deets); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		associations[i].Details = deets[0]
	}

	RespondWithJson(w, http.StatusOK, associations)
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

func AllStoriesInSeriesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email  string
		series string
		err    error
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if series, err = url.PathUnescape(mux.Vars(r)["series"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series name")
		return
	}
	if series == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series name")
		return
	}

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

	var seriesOutput *dynamodb.QueryOutput
	if seriesOutput, err = AwsClient.Query(context.TODO(), queryInput); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var stories []Story

	for _, seriesEntry := range seriesOutput.Items {
		storyTitle := ""
		if av, ok := seriesEntry["story_title"].(*types.AttributeValueMemberS); ok {
			storyTitle = av.Value
		} else {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

		storiesOutput, err := AwsClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("stories"),
			FilterExpression: aws.String("author=:eml AND story_title=:s AND series<>:f"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":s":   &types.AttributeValueMemberS{Value: storyTitle},
				":f":   &types.AttributeValueMemberS{Value: ""},
			},
		})
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		story := []Story{}
		if err = attributevalue.UnmarshalListOfMaps(storiesOutput.Items, &story); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

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
					Value: storyTitle,
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
		story[0].Chapters = chapters

		stories = append(stories, story[0])
	}
	RespondWithJson(w, http.StatusOK, stories)
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
