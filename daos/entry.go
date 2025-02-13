package daos

import (
	"RichDocter/models"
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/joho/godotenv"
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
	DYNAMO_WRITE_BATCH_SIZE     = 50
	DEFAULT_SERIES_IMAGE_URL    = "/img/icons/story_series_icon.jpg"
)

type dynamoDBClient interface {
	DeleteItem(context.Context, *dynamodb.DeleteItemInput, ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
	DescribeTable(context.Context, *dynamodb.DescribeTableInput, ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error)
	CreateTable(context.Context, *dynamodb.CreateTableInput, ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error)
	CreateBackup(context.Context, *dynamodb.CreateBackupInput, ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error)
	PutItem(context.Context, *dynamodb.PutItemInput, ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	Query(context.Context, *dynamodb.QueryInput, ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	Scan(context.Context, *dynamodb.ScanInput, ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
	UpdateItem(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
	DescribeBackup(context.Context, *dynamodb.DescribeBackupInput, ...func(*dynamodb.Options)) (*dynamodb.DescribeBackupOutput, error)
	TransactWriteItems(ctx context.Context, input *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
	DeleteTable(context.Context, *dynamodb.DeleteTableInput, ...func(*dynamodb.Options)) (*dynamodb.DeleteTableOutput, error)
	UpdateContinuousBackups(context.Context, *dynamodb.UpdateContinuousBackupsInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateContinuousBackupsOutput, error)
	RestoreTableFromBackup(context.Context, *dynamodb.RestoreTableFromBackupInput, ...func(*dynamodb.Options)) (*dynamodb.RestoreTableFromBackupOutput, error)
}

type dynamoClient struct {
	// The real AWS DynamoDB client
	client *dynamodb.Client
}

func (d *dynamoClient) DeleteItem(ctx context.Context, input *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	return d.client.DeleteItem(ctx, input, optFns...)
}

func (d *dynamoClient) DescribeTable(ctx context.Context, input *dynamodb.DescribeTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error) {
	return d.client.DescribeTable(ctx, input, optFns...)
}

func (d *dynamoClient) CreateTable(ctx context.Context, input *dynamodb.CreateTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error) {
	return d.client.CreateTable(ctx, input, optFns...)
}

func (d *dynamoClient) CreateBackup(ctx context.Context, input *dynamodb.CreateBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error) {
	return d.client.CreateBackup(ctx, input, optFns...)
}

func (d *dynamoClient) PutItem(ctx context.Context, input *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	return d.client.PutItem(ctx, input, optFns...)
}

func (d *dynamoClient) Query(ctx context.Context, input *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	return d.client.Query(ctx, input, optFns...)
}

func (d *dynamoClient) Scan(ctx context.Context, input *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	return d.client.Scan(ctx, input, optFns...)
}

func (d *dynamoClient) UpdateItem(ctx context.Context, input *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	return d.client.UpdateItem(ctx, input, optFns...)
}

func (d *dynamoClient) DescribeBackup(ctx context.Context, input *dynamodb.DescribeBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeBackupOutput, error) {
	return d.client.DescribeBackup(ctx, input, optFns...)
}

func (d *dynamoClient) TransactWriteItems(ctx context.Context, input *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	return d.client.TransactWriteItems(ctx, input, optFns...)
}

func (d *dynamoClient) DeleteTable(ctx context.Context, input *dynamodb.DeleteTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteTableOutput, error) {
	return d.client.DeleteTable(ctx, input, optFns...)
}

func (d *dynamoClient) UpdateContinuousBackups(ctx context.Context, input *dynamodb.UpdateContinuousBackupsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateContinuousBackupsOutput, error) {
	return d.client.UpdateContinuousBackups(ctx, input, optFns...)
}

func (d *dynamoClient) RestoreTableFromBackup(ctx context.Context, input *dynamodb.RestoreTableFromBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.RestoreTableFromBackupOutput, error) {
	return d.client.RestoreTableFromBackup(ctx, input, optFns...)
}

func NewDynamoClient(client *dynamodb.Client) *dynamoClient {
	return &dynamoClient{client: client}
}

type DAO struct {
	DynamoClient   dynamoDBClient
	s3Client       *s3.Client
	maxRetries     int
	capacity       int
	writeBatchSize int
}

var _ DaoInterface = (*DAO)(nil)

func NewDAO() *DAO {
	var (
		awsCfg                     aws.Config
		err                        error
		maxAWSRetries              int
		blockTableMinWriteCapacity int
	)
	if models.AppMode(strings.ToLower(os.Getenv("MODE"))) != models.ModeProduction {
		if err = godotenv.Load(); err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		panic(err)
	}
	if maxAWSRetries, err = strconv.Atoi(os.Getenv("AWS_MAX_RETRIES")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	if blockTableMinWriteCapacity, err = strconv.Atoi(os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	awsCfg.RetryMaxAttempts = maxAWSRetries
	realClient := dynamodb.NewFromConfig(awsCfg)
	return &DAO{
		DynamoClient:   NewDynamoClient(realClient),
		s3Client:       s3.NewFromConfig(awsCfg),
		maxRetries:     maxAWSRetries,
		capacity:       blockTableMinWriteCapacity,
		writeBatchSize: DYNAMO_WRITE_BATCH_SIZE,
	}
}
