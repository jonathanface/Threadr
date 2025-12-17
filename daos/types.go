package daos

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type RestoreStoryEvent struct {
	StoryID string
	Title   string
	Index   int // 1-based
	Total   int
	Err     error
}

func (e RestoreStoryEvent) OK() bool { return e.Err == nil }

type Options struct {
	Region                     string
	MaxRetries                 int
	BlockTableMinWriteCapacity int
	WriteBatchSize             int
}

type SubscriptionStatus struct {
	Active           bool
	Status           string
	ID               string
	CurrentPeriodEnd time.Time
	Found            bool
}

type dynamoClient struct {
	// The real AWS DynamoDB client
	client *dynamodb.Client
}

type dynamoDBClient interface {
	DeleteItem(context.Context, *dynamodb.DeleteItemInput, ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
	DescribeTable(context.Context, *dynamodb.DescribeTableInput, ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error)
	CreateTable(context.Context, *dynamodb.CreateTableInput, ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error)
	CreateBackup(context.Context, *dynamodb.CreateBackupInput, ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error)
	GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
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

func (d *dynamoClient) GetItem(ctx context.Context, input *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	return d.client.GetItem(ctx, input, optFns...)
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
