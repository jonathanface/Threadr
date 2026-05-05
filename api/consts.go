package api

const (
	s3CustomPortraitBucket = "richdocter-custom-portraits"
	s3ExportsBucket        = "richdocter-document-exports"
	s3StoryImagebucket     = "richdocter-story-portraits"
	s3SeriesImageBucket    = "richdocter-series-portraits"
	tmpExportDir           = "./tmp"
	nonSubscriberMaxAssoc  = 10
	maxStoryIDLength       = 100
	maxChapterCount        = 1000
	maxTitleLength         = 500
	maxDescriptionLength   = 5000
	maxChapterTitleLength  = 500
	oneMB                  = 1024
	maxUploadSize          = 5 * oneMB * oneMB // 5 MB for original upload
	maxScaledSize          = oneMB * oneMB     // 1 MB for final scaled image
	maxImageWidth          = 400
	awsPrefix              = "aws:"
)
