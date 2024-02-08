package daos

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/mock"
)

const (
	S3_STORY_BASE_URL           = "https://richdocter-story-portraits.s3.amazonaws.com"
	S3_SERIES_BASE_URL          = "https://richdocter-series-portraits.s3.amazonaws.com"
	S3_PORTRAIT_BASE_URL        = "https://richdocterportraits.s3.amazonaws.com/"
	S3_LOCATION_BASE_URL        = "https://richdocterlocations.s3.amazonaws.com/"
	S3_EVENT_BASE_URL           = "https://richdocterevents.s3.amazonaws.com/"
	MAX_DEFAULT_PORTRAIT_IMAGES = 50
	MAX_DEFAULT_LOCATION_IMAGES = 20
	MAX_DEFAULT_EVENT_IMAGES    = 20
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

type DAO struct {
	dynamoClient   dynamoDBClient
	s3Client       *s3.Client
	maxRetries     int
	capacity       int
	writeBatchSize int
}

type MockDynamoDBClient struct {
	mock.Mock
}

func (m *MockDynamoDBClient) DeleteItem(ctx context.Context, input *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.DeleteItemOutput), args.Error(1)
}

func (m *MockDynamoDBClient) DescribeTable(ctx context.Context, input *dynamodb.DescribeTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.DescribeTableOutput), args.Error(1)
}

func (m *MockDynamoDBClient) CreateTable(ctx context.Context, input *dynamodb.CreateTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.CreateTableOutput), args.Error(1)
}

func (m *MockDynamoDBClient) DeleteTable(ctx context.Context, input *dynamodb.DeleteTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteTableOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.DeleteTableOutput), args.Error(1)
}

func (m *MockDynamoDBClient) PutItem(ctx context.Context, input *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.PutItemOutput), args.Error(1)
}

func (m *MockDynamoDBClient) Query(ctx context.Context, input *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.QueryOutput), args.Error(1)
}
func (m *MockDynamoDBClient) Scan(ctx context.Context, input *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.ScanOutput), args.Error(1)
}

func (m *MockDynamoDBClient) TransactWriteItems(ctx context.Context, input *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.TransactWriteItemsOutput), args.Error(1)
}

func (m *MockDynamoDBClient) DescribeBackup(ctx context.Context, input *dynamodb.DescribeBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeBackupOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.DescribeBackupOutput), args.Error(1)
}

func (m *MockDynamoDBClient) UpdateItem(ctx context.Context, params *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	args := m.Called(ctx, params, optFns)
	return args.Get(0).(*dynamodb.UpdateItemOutput), args.Error(1)
}

func (m *MockDynamoDBClient) UpdateContinuousBackups(ctx context.Context, input *dynamodb.UpdateContinuousBackupsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateContinuousBackupsOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.UpdateContinuousBackupsOutput), args.Error(1)
}

func (m *MockDynamoDBClient) RestoreTableFromBackup(ctx context.Context, input *dynamodb.RestoreTableFromBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.RestoreTableFromBackupOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.RestoreTableFromBackupOutput), args.Error(1)
}

func (m *MockDynamoDBClient) CreateBackup(ctx context.Context, input *dynamodb.CreateBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error) {
	args := m.Called(ctx, input, optFns)
	return args.Get(0).(*dynamodb.CreateBackupOutput), args.Error(1)
}

func NewMock() *DAO {

	mockDB := new(MockDynamoDBClient)
	return &DAO{
		dynamoClient: mockDB,
		// s3Client:       s3.NewFromConfig(awsCfg),
		// maxRetries:     maxAWSRetries,
		// capacity:       blockTableMinWriteCapacity,
		// writeBatchSize: DYNAMO_WRITE_BATCH_SIZE,
	}
}

func NewDAO() *DAO {
	var (
		awsCfg                     aws.Config
		err                        error
		maxAWSRetries              int
		blockTableMinWriteCapacity int
	)
	if os.Getenv("APP_MODE") != "PRODUCTION" {
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
	return &DAO{
		dynamoClient:   dynamodb.NewFromConfig(awsCfg),
		s3Client:       s3.NewFromConfig(awsCfg),
		maxRetries:     maxAWSRetries,
		capacity:       blockTableMinWriteCapacity,
		writeBatchSize: DYNAMO_WRITE_BATCH_SIZE,
	}
}
