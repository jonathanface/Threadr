package daos

import "time"

const (
	backupPollInterval     = 10 * time.Second
	backupActiveStateLimit = 10 * time.Minute
	// placeConflictOffset is added to a block's place value when two writes
	// in a batch want the same slot. The big offset moves the loser into a
	// transient range that won't collide with anything else mid-batch.
	placeConflictOffset = 1_000_000
	// minLexicalChunkSize is the smallest length a non-empty Lexical
	// paragraph can serialize to. Anything smaller is treated as malformed
	// and we refuse to overwrite well-formed existing content with it.
	minLexicalChunkSize = 50
	// chunkPreviewLength is the length cap for chunk previews logged on
	// data-loss warnings.
	chunkPreviewLength = 100
	// defaultBlockBatchSize is the per-transaction block-write batch size
	// when no override is configured on the DAO.
	defaultBlockBatchSize = 50
	// defaultTxnBatchSize is the per-transaction batch size for the
	// delete-then-put block reorder path.
	defaultTxnBatchSize      = 100
	s3StoryBaseURL           = "https://richdocter-story-portraits.s3.amazonaws.com"
	s3SeriesBaseURL          = "https://richdocter-series-portraits.s3.amazonaws.com"
	s3PortraitBaseURL        = "https://richdocterportraits.s3.amazonaws.com/"
	s3LocationBaseURL        = "https://richdocterlocations.s3.amazonaws.com/"
	s3EventBaseURL           = "https://richdocterevents.s3.amazonaws.com/"
	s3ItemBaseURL            = "https://richdocteritems.s3.amazonaws.com/"
	maxDefaultPortraitImages = 50
	maxDefaultLocationImages = 20
	maxDefaultEventImages    = 20
	maxDefaultItemImages     = 20
	maxShorDescriptionLength = 100
	defaultSeriesImageURL    = "/img/icons/story_series_icon.jpg"

	// DynamoDB attribute names — duplicated in many places where a typo
	// would silently produce empty Query/Scan results, so they live here.
	attrStoryID         = "story_id"
	attrChapterID       = "chapter_id"
	attrSeriesID        = "series_id"
	attrCompositeKey    = "composite_key"
	attrStoryOrSeriesID = "story_or_series_id"
	attrAssociationID   = "association_id"
	attrCommentID       = "comment_id"
	attrImageURL        = "image_url"
	attrDescription     = "description"
	attrCreatedAt       = "created_at"
	attrModifiedAt      = "modified_at"

	// Table-name suffix used for non-prod environments.
	stagingSuffix   = "_staging"
	chaptersTable   = "chapters"
	chaptersStaging = "chapters_staging"

	// Outline section header used by the three-act template.
	outlineHeaderResolution = "Resolution"

	// Default first-chapter title used by initial-story bootstrap paths.
	firstChapterTitle = "Chapter 1"

	// Association-type discriminator used in default-image lookup.
	associationTypeCharacter = "character"
)
