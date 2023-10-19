package models

import (
	"encoding/json"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type StoryBlock struct {
	KeyID string          `json:"key_id" dynamodbav:"key_id"`
	Chunk json.RawMessage `json:"chunk" dynamodbav:"chunk"`
	Place string          `json:"place" dynamodbav:"place"`
}
type StoryBlocks struct {
	Title   string       `json:"title" dynamodbav:"title"`
	Chapter int          `json:"chapter"`
	Blocks  []StoryBlock `json:"blocks" dynamodbav:"blocks"`
}

type AssociationDetails struct {
	ExtendedDescription string `json:"extended_description" dynamodbav:"extended_description"`
	CaseSensitive       bool   `json:"case_sensitive" dynamodbav:"case_sensitive"`
	Aliases             string `json:"aliases" dynamodbav:"aliases"`
}

type Association struct {
	Name             string             `json:"association_name" dynamodbav:"association_name"`
	Type             string             `json:"association_type" dynamodbav:"association_type"`
	Portrait         string             `json:"portrait" dynamodbav:"portrait"`
	ShortDescription string             `json:"short_description" dynamodbav:"short_description"`
	Details          AssociationDetails `json:"details"`
}

type Chapter struct {
	KeyID        string `json:"key_id" dynamodbav:"key_id"`
	ChapterNum   int    `json:"chapter_num" dynamodbav:"chapter_num"`
	ChapterTitle string `json:"chapter_title" dynamodbav:"chapter_title"`
}

type ChapterWithContents struct {
	Chapter Chapter     `json:"chapter"`
	Blocks  *BlocksData `json:"blocks"`
}

type Story struct {
	CreatedAt   int       `json:"created_at" dynamodbav:"created_at"`
	Title       string    `json:"title" dynamodbav:"story_title"`
	Description string    `json:"description" dynamodbav:"description"`
	Series      string    `json:"series" dynamodbav:"series"`
	Chapters    []Chapter `json:"chapters"`
	Place       int       `json:"place"`
}
type BlocksData struct {
	LastEvaluated map[string]types.AttributeValue   `json:"last_evaluated_key"`
	ScannedCount  int32                             `json:"scanned_count"`
	Items         []map[string]types.AttributeValue `json:"items"`
}

type FullStoryContent struct {
	StoryTitle           string                `json:"story_title"`
	ChaptersWithContents []ChapterWithContents `json:"chapters_with_contents"`
}

type Series struct {
	SeriesTitle string    `json:"series_title" dynamodbav:"series_title"`
	Stories     []*Story  `json:"stories"`
	CreatedAt   time.Time `json:"created_at" dynamodbav:"created_at"`
	Place       int       `json:"place" dynamodbav:"place"`
}

type UserInfo struct {
	Email          string `json:"email" dynamodbav:"email"`
	FirstName      string `json:"first_name" dynamodbav:"first_name"`
	Admin          bool   `json:"admin" dynamodbav:"admin"`
	SubscriptionID string `json:"subscription_id" dynamodbav:"subscription_id"`
	CustomerID     string `json:"customer_id" dynamodbav:"customer_id"`
}

type Answer struct {
	Success     bool   `json:"success"`
	NumberWrote int    `json:"wrote"`
	URL         string `json:"url"`
}

type AwsStatusResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

type HTMLData struct {
	Chapter string `json:"chapter"`
	HTML    string `json:"html"`
}

type DocumentExportRequest struct {
	HtmlByChapter []HTMLData `json:"html_by_chapter"`
	Type          string     `json:"type"`
	StoryTitle    string     `json:"story_title"`
}
