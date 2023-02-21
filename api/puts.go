package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

type StoryBlock struct {
	KeyID string          `json:"keyID"`
	Chunk json.RawMessage `json:"chunk"`
	Place string          `json:"place"`
}
type StoryBlocks struct {
	Title  string       `json:"title"`
	Blocks []StoryBlock `json:"blocks"`
}

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
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
	storyBlocks := StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	type PartiQLRunner struct {
		DynamoDbClient *dynamodb.Client
		TableName      string
	}
	runner := PartiQLRunner{
		DynamoDbClient: AwsClient,
		TableName:      "blocks",
	}

	batchSize := 25
	numRecords := len(storyBlocks.Blocks)
	if numRecords < batchSize {
		batchSize = numRecords
	}
	var wg sync.WaitGroup
	for num := 0; num < numRecords; num = num + batchSize {
		start := num
		end := num + batchSize - 1
		errs := make(chan error, 1)
		wg.Add(1)
		go func(s, e int) {
			defer wg.Done()
			for i := s; i <= e; i++ {
				params, err := attributevalue.MarshalList([]interface{}{storyBlocks.Blocks[i].Place, storyBlocks.Blocks[i].KeyID, storyBlocks.Title, email})
				if err != nil {
					errs <- err
					return
				}
				_, err = runner.DynamoDbClient.ExecuteStatement(context.TODO(), &dynamodb.ExecuteStatementInput{
					Statement: aws.String(fmt.Sprintf("UPDATE \"%v\" SET place=? WHERE keyID=? AND story=? AND author=?", runner.TableName)), Parameters: params})
				if err != nil {
					errs <- err
					return
				}
			}
			close(errs)
		}(start, end)
		for err := range errs {
			close(errs)
			RespondWithError(w, http.StatusInternalServerError, err.Error())
		}
	}
	wg.Wait()
	RespondWithJson(w, http.StatusOK, nil)
}

func WriteToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
	storyBlock := StoryBlock{}
	var jsonStr string
	json.Unmarshal([]byte(jsonStr), &r.Body)
	if err := decoder.Decode(&storyBlock); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("blocks"),
		Key: map[string]types.AttributeValue{
			"keyID": &types.AttributeValueMemberS{Value: storyBlock.KeyID},
			"story": &types.AttributeValueMemberS{Value: story},
		},
		UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), author=:e, chunk=:c, place=:p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
			":c": &types.AttributeValueMemberS{Value: string(storyBlock.Chunk)},
			":e": &types.AttributeValueMemberS{Value: email},
			":p": &types.AttributeValueMemberN{Value: storyBlock.Place},
		},
	}
	if _, err = AwsClient.UpdateItem(context.TODO(), input); err != nil {
		fmt.Println("block write err", err)
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	type answer struct {
		Success  bool   `json:"success"`
		NewBlock string `json:"newBlockKey"`
	}
	RespondWithJson(w, http.StatusOK, answer{Success: true, NewBlock: storyBlock.KeyID})
}
