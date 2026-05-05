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
	defaultSeriesImageURL    = "/img/icons/story_series_icon.jpg"
)
