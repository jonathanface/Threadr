package daos

import (
	"context"
	"log"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type MockDAO struct {
	*DAO
}

var _ DaoInterface = (*MockDAO)(nil)

type MockDynamoClient struct {
	MockDeleteItem              func(ctx context.Context, input *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
	MockDescribeTable           func(ctx context.Context, input *dynamodb.DescribeTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error)
	MockCreateTable             func(ctx context.Context, input *dynamodb.CreateTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error)
	MockCreateBackup            func(ctx context.Context, input *dynamodb.CreateBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error)
	MockPutItem                 func(ctx context.Context, input *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	MockQuery                   func(ctx context.Context, input *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	MockScan                    func(ctx context.Context, input *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
	MockUpdateItem              func(ctx context.Context, input *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
	MockDescribeBackup          func(ctx context.Context, input *dynamodb.DescribeBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeBackupOutput, error)
	MockTransactWriteItems      func(ctx context.Context, input *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
	MockDeleteTable             func(ctx context.Context, input *dynamodb.DeleteTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteTableOutput, error)
	MockUpdateContinuousBackups func(ctx context.Context, input *dynamodb.UpdateContinuousBackupsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateContinuousBackupsOutput, error)
	MockRestoreTableFromBackup  func(ctx context.Context, input *dynamodb.RestoreTableFromBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.RestoreTableFromBackupOutput, error)
}

// Make sure our MockDynamoClient implements the interface:
var _ dynamoDBClient = (*MockDynamoClient)(nil)

// DeleteItem
func (m *MockDynamoClient) DeleteItem(ctx context.Context, input *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	if m.MockDeleteItem != nil {
		return m.MockDeleteItem(ctx, input, optFns...)
	}
	return &dynamodb.DeleteItemOutput{}, nil
}

// DescribeTable
func (m *MockDynamoClient) DescribeTable(ctx context.Context, input *dynamodb.DescribeTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeTableOutput, error) {
	if m.MockDescribeTable != nil {
		return m.MockDescribeTable(ctx, input, optFns...)
	}
	return &dynamodb.DescribeTableOutput{}, nil
}

// CreateTable
func (m *MockDynamoClient) CreateTable(ctx context.Context, input *dynamodb.CreateTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateTableOutput, error) {
	if m.MockCreateTable != nil {
		return m.MockCreateTable(ctx, input, optFns...)
	}
	return &dynamodb.CreateTableOutput{}, nil
}

// CreateBackup
func (m *MockDynamoClient) CreateBackup(ctx context.Context, input *dynamodb.CreateBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.CreateBackupOutput, error) {
	if m.MockCreateBackup != nil {
		return m.MockCreateBackup(ctx, input, optFns...)
	}
	return &dynamodb.CreateBackupOutput{}, nil
}

// PutItem
func (m *MockDynamoClient) PutItem(ctx context.Context, input *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.MockPutItem != nil {
		return m.MockPutItem(ctx, input, optFns...)
	}
	return &dynamodb.PutItemOutput{}, nil
}

// Query
func (m *MockDynamoClient) Query(ctx context.Context, input *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	if m.MockQuery != nil {
		return m.MockQuery(ctx, input, optFns...)
	}
	return &dynamodb.QueryOutput{}, nil
}

// Scan
func (m *MockDynamoClient) Scan(ctx context.Context, input *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	if m.MockScan != nil {
		return m.MockScan(ctx, input, optFns...)
	}
	return &dynamodb.ScanOutput{}, nil
}

// UpdateItem
func (m *MockDynamoClient) UpdateItem(ctx context.Context, input *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	if m.MockUpdateItem != nil {
		return m.MockUpdateItem(ctx, input, optFns...)
	}
	return &dynamodb.UpdateItemOutput{}, nil
}

// DescribeBackup
func (m *MockDynamoClient) DescribeBackup(ctx context.Context, input *dynamodb.DescribeBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DescribeBackupOutput, error) {
	if m.MockDescribeBackup != nil {
		return m.MockDescribeBackup(ctx, input, optFns...)
	}
	return &dynamodb.DescribeBackupOutput{}, nil
}

// TransactWriteItems
func (m *MockDynamoClient) TransactWriteItems(ctx context.Context, input *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	if m.MockTransactWriteItems != nil {
		log.Println("WTF")
		return m.MockTransactWriteItems(ctx, input, optFns...)
	}
	return &dynamodb.TransactWriteItemsOutput{}, nil
}

// DeleteTable
func (m *MockDynamoClient) DeleteTable(ctx context.Context, input *dynamodb.DeleteTableInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteTableOutput, error) {
	if m.MockDeleteTable != nil {
		return m.MockDeleteTable(ctx, input, optFns...)
	}
	return &dynamodb.DeleteTableOutput{}, nil
}

// UpdateContinuousBackups
func (m *MockDynamoClient) UpdateContinuousBackups(ctx context.Context, input *dynamodb.UpdateContinuousBackupsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateContinuousBackupsOutput, error) {
	if m.MockUpdateContinuousBackups != nil {
		return m.MockUpdateContinuousBackups(ctx, input, optFns...)
	}
	return &dynamodb.UpdateContinuousBackupsOutput{}, nil
}

// RestoreTableFromBackup
func (m *MockDynamoClient) RestoreTableFromBackup(ctx context.Context, input *dynamodb.RestoreTableFromBackupInput, optFns ...func(*dynamodb.Options)) (*dynamodb.RestoreTableFromBackupOutput, error) {
	if m.MockRestoreTableFromBackup != nil {
		return m.MockRestoreTableFromBackup(ctx, input, optFns...)
	}
	return &dynamodb.RestoreTableFromBackupOutput{}, nil
}

func NewMockDAO() *MockDAO {
	maxAWSRetries := 10
	blockTableMinWriteCapacity := 10
	mockClient := &MockDynamoClient{}
	return &MockDAO{
		DAO: &DAO{
			writeBatchSize: 2,
			maxRetries:     maxAWSRetries,
			capacity:       blockTableMinWriteCapacity,
			DynamoClient:   mockClient,
		},
	}

}
