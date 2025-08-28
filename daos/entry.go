package daos

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	S3_STORY_BASE_URL           = "https://richdocter-story-portraits.s3.amazonaws.com"
	S3_SERIES_BASE_URL          = "https://richdocter-series-portraits.s3.amazonaws.com"
	S3_PORTRAIT_BASE_URL        = "https://richdocterportraits.s3.amazonaws.com/"
	S3_LOCATION_BASE_URL        = "https://richdocterlocations.s3.amazonaws.com/"
	S3_EVENT_BASE_URL           = "https://richdocterevents.s3.amazonaws.com/"
	S3_ITEM_BASE_URL            = "https://richdocteritems.s3.amazonaws.com/"
	MAX_DEFAULT_PORTRAIT_IMAGES = 50
	MAX_DEFAULT_LOCATION_IMAGES = 20
	MAX_DEFAULT_EVENT_IMAGES    = 20
	MAX_DEFAULT_ITEM_IMAGES     = 20
	DEFAULT_SERIES_IMAGE_URL    = "/img/icons/story_series_icon.jpg"
)

var _ DaoInterface = (*DAO)(nil)

func NewDAO(ctx context.Context, opts Options) (*DAO, error) {

	awsCfg, err := config.LoadDefaultConfig(
		ctx,
		config.WithRegion(opts.Region),
		config.WithRetryer(func() aws.Retryer {
			return retry.NewStandard(func(o *retry.StandardOptions) {
				o.MaxAttempts = opts.MaxRetries
			})
		}),
	)
	if err != nil {
		return nil, err
	}
	return &DAO{
		DynamoClient:   NewDynamoClient(dynamodb.NewFromConfig(awsCfg)),
		s3Client:       s3.NewFromConfig(awsCfg),
		maxRetries:     opts.MaxRetries,
		capacity:       opts.BlockTableMinWriteCapacity,
		writeBatchSize: opts.WriteBatchSize,
	}, nil
}
