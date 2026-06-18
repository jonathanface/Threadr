package api

const (
	s3CustomPortraitBucket = "richdocter-custom-portraits"
	s3ExportsBucket        = "richdocter-document-exports"
	s3StoryImagebucket     = "richdocter-story-portraits"
	s3SeriesImageBucket    = "richdocter-series-portraits"
	tmpExportDir           = "./tmp"
	maxStoryIDLength       = 100
	maxChapterCount        = 1000
	maxTitleLength         = 500
	maxDescriptionLength   = 5000
	maxChapterTitleLength  = 500
	oneMB                  = 1024
	// maxUploadFileSize caps an individual uploaded file at 5 MB.
	maxUploadFileSize = 5 * oneMB * oneMB
	// maxUploadSize caps the total multipart request body. Set 1 MB above
	// maxUploadFileSize so a maxed-out 5 MB file plus multipart boundaries,
	// part headers, and any sibling form fields still fits.
	maxUploadSize = maxUploadFileSize + oneMB*oneMB
	// parseFormMemoryBudget is the in-memory budget for ParseMultipartForm.
	// The body is bounded above by maxUploadSize via http.MaxBytesReader, so
	// this controls how much of the form is held in RAM vs. spilled to disk.
	parseFormMemoryBudget = 10 << 20 // 10 MB
	maxScaledSize         = oneMB * oneMB
	maxImageWidth         = 400
	awsPrefix             = "aws:"

	// firstChapterTitle is the default title given to the first chapter when
	// a story is created or imported.
	firstChapterTitle = "Chapter 1"

	// MIME type strings used by upload validators.
	contentTypeJPEG = "image/jpeg"
	contentTypePNG  = "image/png"
	contentTypeGIF  = "image/gif"

	// Validation messages reused across validators.
	msgStoryTitleRequired = "Story title is required"

	// JSON / DDB attribute names.
	fieldStoryID     = "story_id"
	fieldDescription = "description"
)
