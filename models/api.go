package models

import (
	"encoding/json"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type OpenAIResponse struct {
	Choices []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type Chunk struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	Text string `json:"text"`
}

type StoryBlock struct {
	KeyID string          `json:"key_id" dynamodbav:"key_id"`
	Chunk json.RawMessage `json:"chunk" dynamodbav:"chunk"`
	Place string          `json:"place" dynamodbav:"place"`
}
type StoryBlocks struct {
	StoryID   string       `json:"story_id" dynamodbav:"story_id"`
	ChapterID string       `json:"chapter_id"`
	Blocks    []StoryBlock `json:"blocks" dynamodbav:"blocks"`
}

// BlockOrder is used for reordering blocks (no content, just position)
type BlockOrder struct {
	KeyID string `json:"key_id"`
	Place string `json:"place"`
}
type BlocksOrder struct {
	StoryID   string       `json:"story_id"`
	ChapterID string       `json:"chapter_id"`
	Blocks    []BlockOrder `json:"blocks"`
}

type AssociationDetails struct {
	ExtendedDescription string `json:"extended_description" dynamodbav:"extended_description"`
}

type Association struct {
	ID               string             `json:"association_id" dynamodbav:"association_id"`
	Name             string             `json:"association_name" dynamodbav:"association_name"`
	Type             string             `json:"association_type" dynamodbav:"association_type"`
	Portrait         string             `json:"portrait" dynamodbav:"portrait"`
	ShortDescription string             `json:"short_description" dynamodbav:"short_description"`
	Details          AssociationDetails `json:"details"`
	CaseSensitive    bool               `json:"case_sensitive" dynamodbav:"case_sensitive"`
	Aliases          string             `json:"aliases" dynamodbav:"aliases"`
}

type SimplifiedAssociation struct {
	ID               string `json:"association_id" dynamodbav:"association_id"`
	Name             string `json:"association_name" dynamodbav:"association_name"`
	Type             string `json:"association_type" dynamodbav:"association_type"`
	Portrait         string `json:"portrait" dynamodbav:"portrait"`
	ShortDescription string `json:"short_description" dynamodbav:"short_description"`
	CaseSensitive    bool   `json:"case_sensitive" dynamodbav:"case_sensitive"`
	Aliases          string `json:"aliases" dynamodbav:"aliases"`
}

type Chapter struct {
	ID        string `json:"id" dynamodbav:"chapter_id"`
	StoryID   string `json:"story_id" dynamodbav:"story_id"`
	Place     int    `json:"place" dynamodbav:"chapter_num"`
	Title     string `json:"title" dynamodbav:"title"`
	BackupARN string `dynamodbav:"bup_arn"`
}

type ChapterWithContents struct {
	Chapter Chapter     `json:"chapter"`
	Blocks  *BlocksData `json:"blocks"`
}

type Story struct {
	ID          string           `json:"story_id" dynamodbav:"story_id"`
	CreatedAt   int              `json:"created_at" dynamodbav:"created_at"`
	Title       string           `json:"title" dynamodbav:"title"`
	Description string           `json:"description" dynamodbav:"description"`
	SeriesID    string           `json:"series_id" dynamodbav:"series_id"`
	Chapters    []Chapter        `json:"chapters"`
	Outline     *OutlineResponse `json:"outline"`
	Place       int              `json:"place"`
	ImageURL    string           `json:"image_url" dynamodbav:"image_url"`
	Inactive    bool             `json:"inactive" dynamodbav:"inactive"`
}
type StorySettings struct {
	Spellcheck bool `json:"spellcheck" dynamodbav:"spellcheck"`
	Autotab    bool `json:"autotab" dynamodbav:"autotab"`
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
	ID          string    `json:"series_id" dynamodbav:"series_id"`
	Title       string    `json:"series_title" dynamodbav:"title"`
	Description string    `json:"series_description" dynamodbav:"description"`
	Stories     []*Story  `json:"stories"`
	CreatedAt   time.Time `json:"created_at" dynamodbav:"created_at"`
	ImageURL    string    `json:"image_url" dynamodbav:"image_url"`
}

type UserInfo struct {
	Email          string `json:"email" dynamodbav:"email"`
	FirstName      string `json:"first_name" dynamodbav:"first_name"`
	LastName       string `json:"last_name" dynamodbav:"last_name"`
	Admin          bool   `json:"admin" dynamodbav:"admin"`
	AuthType       string `json:"auth_type"`
	Subscriber     bool   `json:"subscriber" dynamodbav:"subscriber"`
	NotifyExpired  bool   `json:"notify_expired,omitempty"`
	NotifyRestored bool   `json:"notify_restored,omitempty"`
	DeletedAt      string `json:"deleted_at,omitempty" dynamodbav:"deleted_at"`
	NewUser        bool   `json:"showWelcome,omitempty"`        // Transient flag for brand new users (not stored in DB) - mapped to showWelcome in frontend
	ReturningUser  bool   `json:"isReturningUser,omitempty"`   // Transient flag for returning deleted users (not stored in DB)
}

// AdminStoryInfo represents a story with its optional series for the admin area
type AdminStoryInfo struct {
	Title       string `json:"title"`
	SeriesTitle string `json:"series_title,omitempty"`
}

// AdminUserSummary is used by the admin area to display user info with their stories
type AdminUserSummary struct {
	Email        string           `json:"email"`
	FirstName    string           `json:"first_name"`
	LastName     string           `json:"last_name"`
	Subscriber   bool             `json:"subscriber"`
	LastAccessed int64            `json:"last_accessed"`
	Stories      []AdminStoryInfo `json:"stories"`
}

type Subscription struct {
	Email                  string    `json:"email" dynamodbav:"email"`
	SubscriptionID         string    `json:"subscription_id" dynamodbav:"subscription_id"`
	CustomerID             string    `json:"customer_id" dynamodbav:"customer_id"`
	CurrentSubscriptionEnd time.Time `dynamodbav:"current_subscription_end"`
	LastSubCheck           time.Time `dynamodbav:"last_sub_check"`
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

type ExportFormat string

const (
	FormatPDF  ExportFormat = "pdf"
	FormatDOCX ExportFormat = "docx"
	FormatEPUB ExportFormat = "epub"
)

type DocumentExportRequest struct {
	StoryID       string       `json:"story_id"`
	HtmlByChapter []HTMLData   `json:"html_by_chapter"`
	Type          ExportFormat `json:"type"`
	Title         string       `json:"title"`
	Author        *string      `json:"author"`
	CoverImage    *string      `json:"cover_image"`
}

type OutlineTemplate string
type OutlineSectionStatus string

const (
	ThreeAct    OutlineTemplate      = "threeAct"
	FiveAct     OutlineTemplate      = "fiveAct"
	HeroJourney OutlineTemplate      = "heroJourney"
	Draft       OutlineSectionStatus = "Draft"
	Revising    OutlineSectionStatus = "Revising"
	None        OutlineSectionStatus = "None"
)

type OutlineSection struct {
	Header      string               `json:"header"`
	Description string               `json:"description"`
	Text        string               `json:"text"`
	Place       int                  `json:"place"`
	Chapters    []string             `json:"chapters"`
	Status      OutlineSectionStatus `json:"status"`
}

type OutlineRequest struct {
	StoryID   string           `json:"storyID"`
	Template  OutlineTemplate  `json:"outlineTemplate"`
	Sections  []OutlineSection `json:"sections"`
	Backstory string           `json:"backstory"`
}

type OutlineResponse struct {
	StoryID    string           `json:"storyID"`
	Template   OutlineTemplate  `json:"outlineTemplate"`
	Sections   []OutlineSection `json:"sections"`
	Unassigned []string         `json:"unassigned"`
	Backstory  string           `json:"backstory"`
}
