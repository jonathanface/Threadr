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
	Chunk json.RawMessage `json:"chunk"  dynamodbav:"chunk"`
	Place string          `json:"place"  dynamodbav:"place"`
}
type StoryBlocks struct {
	StoryID   string       `json:"story_id"   dynamodbav:"story_id"`
	ChapterID string       `json:"chapter_id"`
	Blocks    []StoryBlock `json:"blocks"     dynamodbav:"blocks"`
}

// BlockOrder is used for reordering blocks (no content, just position).
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
	ID               string             `json:"association_id"    dynamodbav:"association_id"`
	Name             string             `json:"association_name"  dynamodbav:"association_name"`
	Type             string             `json:"association_type"  dynamodbav:"association_type"`
	Portrait         string             `json:"portrait"          dynamodbav:"portrait"`
	ShortDescription string             `json:"short_description" dynamodbav:"short_description"`
	Details          AssociationDetails `json:"details"`
	CaseSensitive    bool               `json:"case_sensitive"    dynamodbav:"case_sensitive"`
	Aliases          string             `json:"aliases"           dynamodbav:"aliases"`
}

type SimplifiedAssociation struct {
	ID               string `json:"association_id"    dynamodbav:"association_id"`
	Name             string `json:"association_name"  dynamodbav:"association_name"`
	Type             string `json:"association_type"  dynamodbav:"association_type"`
	Portrait         string `json:"portrait"          dynamodbav:"portrait"`
	ShortDescription string `json:"short_description" dynamodbav:"short_description"`
	CaseSensitive    bool   `json:"case_sensitive"    dynamodbav:"case_sensitive"`
	Aliases          string `json:"aliases"           dynamodbav:"aliases"`
}

type Chapter struct {
	ID           string `json:"id"                      dynamodbav:"chapter_id"`
	StoryID      string `json:"story_id"                dynamodbav:"story_id"`
	Place        int    `json:"place"                   dynamodbav:"chapter_num"`
	Title        string `json:"title"                   dynamodbav:"title"`
	BackupARN    string `json:"-"                       dynamodbav:"bup_arn"`
	CommentCount int    `json:"comment_count,omitempty" dynamodbav:"-"`
}

type ChapterWithContents struct {
	Chapter Chapter     `json:"chapter"`
	Blocks  *BlocksData `json:"blocks"`
}

type Story struct {
	ID          string           `json:"story_id"    dynamodbav:"story_id"`
	CreatedAt   int              `json:"created_at"  dynamodbav:"created_at"`
	Title       string           `json:"title"       dynamodbav:"title"`
	Description string           `json:"description" dynamodbav:"description"`
	SeriesID    string           `json:"series_id"   dynamodbav:"series_id"`
	Chapters    []Chapter        `json:"chapters"`
	Outline     *OutlineResponse `json:"outline"`
	Place       int              `json:"place"`
	ImageURL    string           `json:"image_url"   dynamodbav:"image_url"`
	Inactive    bool             `json:"inactive"    dynamodbav:"inactive"`
}
type StorySettings struct {
	Spellcheck bool `json:"spellcheck" dynamodbav:"spellcheck"`
	Autotab    bool `json:"autotab"    dynamodbav:"autotab"`
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
	ID          string    `json:"series_id"          dynamodbav:"series_id"`
	Title       string    `json:"series_title"       dynamodbav:"title"`
	Description string    `json:"series_description" dynamodbav:"description"`
	Stories     []*Story  `json:"stories"`
	CreatedAt   time.Time `json:"created_at"         dynamodbav:"created_at"`
	ImageURL    string    `json:"image_url"          dynamodbav:"image_url"`
}

type UserInfo struct {
	Email                    string `json:"email"                     dynamodbav:"email"`
	FirstName                string `json:"first_name"                dynamodbav:"first_name"`
	LastName                 string `json:"last_name"                 dynamodbav:"last_name"`
	Admin                    bool   `json:"admin"                     dynamodbav:"admin"`
	AuthType                 string `json:"auth_type"                 dynamodbav:"auth_type"`
	Subscriber               bool   `json:"subscriber"                dynamodbav:"subscriber"`
	PasswordHash             string `json:"-"                         dynamodbav:"password_hash"`
	EmailVerified            bool   `json:"email_verified,omitempty"  dynamodbav:"email_verified"`
	VerificationToken        string `json:"-"                         dynamodbav:"verification_token"`
	VerificationTokenExpires int64  `json:"-"                         dynamodbav:"verification_token_expires"`
	ResetToken               string `json:"-"                         dynamodbav:"reset_token"`
	ResetTokenExpires        int64  `json:"-"                         dynamodbav:"reset_token_expires"`
	NotifyExpired            bool   `json:"notify_expired,omitempty"`
	NotifyRestored           bool   `json:"notify_restored,omitempty"`
	DeletedAt                string `json:"deleted_at,omitempty"      dynamodbav:"deleted_at"`
	NewUser                  bool   `json:"showWelcome,omitempty"`     // Transient flag for brand new users (not stored in DB)
	ReturningUser            bool   `json:"isReturningUser,omitempty"` // Transient flag for returning deleted users (not stored in DB)
}

type EmailSignupRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type EmailLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type PasswordResetRequest struct {
	Email string `json:"email"`
}

type PasswordResetConfirm struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// AdminStoryInfo represents a story with its optional series for the admin area.
type AdminStoryInfo struct {
	Title       string `json:"title"`
	SeriesTitle string `json:"series_title,omitempty"`
}

// AdminUserSummary is used by the admin area to display user info with their stories.
type AdminUserSummary struct {
	Email        string           `json:"email"`
	FirstName    string           `json:"first_name"`
	LastName     string           `json:"last_name"`
	Subscriber   bool             `json:"subscriber"`
	LastAccessed int64            `json:"last_accessed"`
	Stories      []AdminStoryInfo `json:"stories"`
}

type Subscription struct {
	Email                  string    `json:"email"           dynamodbav:"email"`
	SubscriptionID         string    `json:"subscription_id" dynamodbav:"subscription_id"`
	CustomerID             string    `json:"customer_id"     dynamodbav:"customer_id"`
	CurrentSubscriptionEnd time.Time `                       dynamodbav:"current_subscription_end"`
	LastSubCheck           time.Time `                       dynamodbav:"last_sub_check"`
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

type ShareLink struct {
	Token           string `json:"token"                dynamodbav:"token"`
	StoryID         string `json:"story_id"             dynamodbav:"story_id"`
	ChapterID       string `json:"chapter_id,omitempty" dynamodbav:"chapter_id"`
	AuthorEmail     string `json:"author_email"         dynamodbav:"author_email"`
	ReaderEmail     string `json:"reader_email"         dynamodbav:"reader_email"`
	ReaderFirstName string `json:"reader_first_name"    dynamodbav:"reader_first_name"`
	ReaderLastName  string `json:"reader_last_name"     dynamodbav:"reader_last_name"`
	CreatedAt       int64  `json:"created_at"           dynamodbav:"created_at"`
	ExpiresAt       int64  `json:"expires_at"           dynamodbav:"expires_at"`
	Revoked         bool   `json:"revoked"              dynamodbav:"revoked"`
	CommentsEnabled bool   `json:"comments_enabled"     dynamodbav:"comments_enabled"`
	Label           string `json:"label,omitempty"      dynamodbav:"label"`
}

type Comment struct {
	CommentID          string `json:"comment_id"            dynamodbav:"comment_id"`
	ShareToken         string `json:"share_token"           dynamodbav:"share_token"`
	StoryID            string `json:"story_id"              dynamodbav:"story_id"`
	ChapterID          string `json:"chapter_id"            dynamodbav:"chapter_id"`
	BlockKeyID         string `json:"block_key_id"          dynamodbav:"block_key_id"`
	AnchorOffset       int    `json:"anchor_offset"         dynamodbav:"anchor_offset"`
	FocusOffset        int    `json:"focus_offset"          dynamodbav:"focus_offset"`
	AnchorTextSnapshot string `json:"anchor_text_snapshot"  dynamodbav:"anchor_text_snapshot"`
	ReaderEmail        string `json:"reader_email"          dynamodbav:"reader_email"`
	ReaderFirstName    string `json:"reader_first_name"     dynamodbav:"reader_first_name"`
	ReaderLastName     string `json:"reader_last_name"      dynamodbav:"reader_last_name"`
	Body               string `json:"body"                  dynamodbav:"body"`
	CreatedAt          int64  `json:"created_at"            dynamodbav:"created_at"`
	Resolved           bool   `json:"resolved"              dynamodbav:"resolved"`
	ResolvedAt         int64  `json:"resolved_at,omitempty" dynamodbav:"resolved_at"`
}

type CreateShareLinkRequest struct {
	ChapterID       string `json:"chapter_id,omitempty"`
	ReaderEmail     string `json:"reader_email"`
	ReaderFirstName string `json:"reader_first_name"`
	ReaderLastName  string `json:"reader_last_name"`
	ExpiresAt       int64  `json:"expires_at"`
	CommentsEnabled bool   `json:"comments_enabled"`
	Label           string `json:"label,omitempty"`
}

type CreateCommentRequest struct {
	ChapterID          string `json:"chapter_id"`
	BlockKeyID         string `json:"block_key_id"`
	AnchorOffset       int    `json:"anchor_offset"`
	FocusOffset        int    `json:"focus_offset"`
	AnchorTextSnapshot string `json:"anchor_text_snapshot"`
	Body               string `json:"body"`
}

// Alerts / Notifications

type AlertType string

const (
	AlertTypeAnnouncement AlertType = "announcement"
	AlertTypePersonal     AlertType = "personal"
)

type Alert struct {
	ID          string    `json:"alert_id"       dynamodbav:"alert_id"`
	Subject     string    `json:"subject"        dynamodbav:"subject"`
	Message     string    `json:"message"        dynamodbav:"message"`
	Link        string    `json:"link,omitempty" dynamodbav:"link"`
	AlertType   AlertType `json:"alert_type"     dynamodbav:"alert_type"`
	TargetEmail string    `json:"target_email"   dynamodbav:"target_email"`
	CreatedAt   int64     `json:"created_at"     dynamodbav:"created_at"`
	CreatedBy   string    `json:"created_by"     dynamodbav:"created_by"`
}

type AlertRead struct {
	Email   string `json:"email"    dynamodbav:"email"`
	AlertID string `json:"alert_id" dynamodbav:"alert_id"`
	ReadAt  int64  `json:"read_at"  dynamodbav:"read_at"`
}

type UserAlert struct {
	Alert

	Read   bool  `json:"read"`
	ReadAt int64 `json:"read_at,omitempty"`
}

type CreateAlertRequest struct {
	Subject     string    `json:"subject"`
	Message     string    `json:"message"`
	Link        string    `json:"link,omitempty"`
	AlertType   AlertType `json:"alert_type"`
	TargetEmail string    `json:"target_email,omitempty"`
}

type AlertsResponse struct {
	Alerts      []UserAlert `json:"alerts"`
	UnreadCount int         `json:"unread_count"`
}
