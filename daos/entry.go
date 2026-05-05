package daos

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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
