package daos

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

// Tests for createBlockTable.
func TestCreateBlockTable(t *testing.T) {
	testCases := []struct {
		name          string
		tableName     string
		tags          *[]types.Tag
		mockCreateErr error
		wantErr       bool
	}{
		{
			name:      "SuccessfulTableCreation",
			tableName: "test_story_chapter_blocks",
			tags: &[]types.Tag{
				{Key: aws.String("Environment"), Value: aws.String("test")},
			},
			wantErr: false,
		},
		{
			name:          "CreateTableError",
			tableName:     "error_table",
			tags:          &[]types.Tag{},
			mockCreateErr: errors.New("create table failed"),
			wantErr:       true,
		},
		{
			name:      "EmptyTableName",
			tableName: "",
			tags:      &[]types.Tag{},
			wantErr:   false, // Mock won't validate this
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
			if !ok {
				t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
			}

			// Track if CreateTable was called with correct parameters
			var calledWithTableName string
			var calledWithTags []types.Tag
			mockClient.MockCreateTable = func(ctx context.Context,
				input *dynamodb.CreateTableInput,
				opts ...func(*dynamodb.Options),
			) (*dynamodb.CreateTableOutput, error) {
				if input.TableName != nil {
					calledWithTableName = *input.TableName
				}
				if input.Tags != nil {
					calledWithTags = input.Tags
				}
				if tc.mockCreateErr != nil {
					return nil, tc.mockCreateErr
				}
				return &dynamodb.CreateTableOutput{}, nil
			}

			err := mockDao.createBlockTable(context.Background(), tc.tableName, tc.tags)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				// Verify CreateTable was called with correct table name
				if calledWithTableName != tc.tableName {
					t.Errorf("Expected table name %q, got %q", tc.tableName, calledWithTableName)
				}
				// Verify tags were passed correctly
				if tc.tags != nil && len(calledWithTags) != len(*tc.tags) {
					t.Errorf("Expected %d tags, got %d", len(*tc.tags), len(calledWithTags))
				}
			}

			// Note: The goroutine for PITR setup is launched asynchronously,
			// so we can't easily test it without adding delays or channels
			t.Logf("createBlockTable(%q) completed synchronous portion", tc.tableName)
		})
	}
}

// Tests for CheckTableStatus.
func TestCheckTableStatus(t *testing.T) {
	testCases := []struct {
		name           string
		tableName      string
		mockStatus     types.TableStatus
		mockErr        error
		expectedStatus string
		wantErr        bool
	}{
		{
			name:           "ActiveTable",
			tableName:      "test_table",
			mockStatus:     types.TableStatusActive,
			expectedStatus: "ACTIVE",
			wantErr:        false,
		},
		{
			name:           "CreatingTable",
			tableName:      "new_table",
			mockStatus:     types.TableStatusCreating,
			expectedStatus: "CREATING",
			wantErr:        false,
		},
		{
			name:      "DescribeTableError",
			tableName: "error_table",
			mockErr:   errors.New("describe failed"),
			wantErr:   true,
		},
		{
			name:           "DeletingTable",
			tableName:      "old_table",
			mockStatus:     types.TableStatusDeleting,
			expectedStatus: "DELETING",
			wantErr:        false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
			if !ok {
				t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
			}

			mockClient.MockDescribeTable = func(ctx context.Context,
				input *dynamodb.DescribeTableInput,
				opts ...func(*dynamodb.Options),
			) (*dynamodb.DescribeTableOutput, error) {
				if tc.mockErr != nil {
					return nil, tc.mockErr
				}
				return &dynamodb.DescribeTableOutput{
					Table: &types.TableDescription{
						TableStatus: tc.mockStatus,
					},
				}, nil
			}

			status, err := mockDao.CheckTableStatus(context.Background(), tc.tableName)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if status != tc.expectedStatus {
					t.Errorf("Expected status %q, got %q", tc.expectedStatus, status)
				}
			}
		})
	}
}

// Tests for isResourceNotFound.
func TestIsResourceNotFound(t *testing.T) {
	testCases := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name: "ResourceNotFoundException",
			err: &smithy.OperationError{
				Err: &types.ResourceNotFoundException{
					Message: aws.String("Table not found"),
				},
			},
			expected: true,
		},
		{
			name:     "OtherError",
			err:      errors.New("some other error"),
			expected: false,
		},
		{
			name:     "NilError",
			err:      nil,
			expected: false,
		},
		{
			name: "DifferentAWSError",
			err: &smithy.OperationError{
				Err: &types.TableInUseException{
					Message: aws.String("Table in use"),
				},
			},
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := isResourceNotFound(tc.err)
			if result != tc.expected {
				t.Errorf("isResourceNotFound(%v) = %v, expected %v", tc.err, result, tc.expected)
			}
		})
	}
}

// Tests for isTableInUse.
func TestIsTableInUse(t *testing.T) {
	testCases := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name: "TableInUseException",
			err: &smithy.OperationError{
				Err: &types.TableInUseException{
					Message: aws.String("Table is in use"),
				},
			},
			expected: true,
		},
		{
			name:     "OtherError",
			err:      errors.New("some other error"),
			expected: false,
		},
		{
			name:     "NilError",
			err:      nil,
			expected: false,
		},
		{
			name: "DifferentAWSError",
			err: &smithy.OperationError{
				Err: &types.ResourceNotFoundException{
					Message: aws.String("Not found"),
				},
			},
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := isTableInUse(tc.err)
			if result != tc.expected {
				t.Errorf("isTableInUse(%v) = %v, expected %v", tc.err, result, tc.expected)
			}
		})
	}
}

// Tests for isTableAlreadyExists.
func TestIsTableAlreadyExists(t *testing.T) {
	testCases := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name: "TableAlreadyExistsException",
			err: &smithy.OperationError{
				Err: &types.TableAlreadyExistsException{
					Message: aws.String("Table already exists"),
				},
			},
			expected: true,
		},
		{
			name:     "OtherError",
			err:      errors.New("some other error"),
			expected: false,
		},
		{
			name:     "NilError",
			err:      nil,
			expected: false,
		},
		{
			name: "DifferentAWSError",
			err: &smithy.OperationError{
				Err: &types.TableInUseException{
					Message: aws.String("Table in use"),
				},
			},
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := isTableAlreadyExists(tc.err)
			if result != tc.expected {
				t.Errorf("isTableAlreadyExists(%v) = %v, expected %v", tc.err, result, tc.expected)
			}
		})
	}
}

// Tests for waitForTableStatus.
func TestWaitForTableStatus(t *testing.T) {
	testCases := []struct {
		name        string
		tableName   string
		wantStatus  string
		timeout     time.Duration
		mockStatus  types.TableStatus
		mockErr     error
		expectErr   bool
		errContains string
	}{
		{
			name:       "TableBecomesActive",
			tableName:  "test_table",
			wantStatus: "ACTIVE",
			timeout:    5 * time.Second,
			mockStatus: types.TableStatusActive,
			expectErr:  false,
		},
		{
			name:        "Timeout",
			tableName:   "slow_table",
			wantStatus:  "ACTIVE",
			timeout:     100 * time.Millisecond,
			mockStatus:  types.TableStatusCreating,
			expectErr:   true,
			errContains: "timeout",
		},
		{
			name:       "TableNotExistsWanted",
			tableName:  "deleted_table",
			wantStatus: "NOT_EXISTS",
			timeout:    5 * time.Second,
			mockErr: &smithy.OperationError{
				Err: &types.ResourceNotFoundException{
					Message: aws.String("Table not found"),
				},
			},
			expectErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockClient := &MockDynamoClient{}

			mockClient.MockDescribeTable = func(ctx context.Context,
				input *dynamodb.DescribeTableInput,
				opts ...func(*dynamodb.Options),
			) (*dynamodb.DescribeTableOutput, error) {
				if tc.mockErr != nil {
					return nil, tc.mockErr
				}
				return &dynamodb.DescribeTableOutput{
					Table: &types.TableDescription{
						TableStatus: tc.mockStatus,
					},
				}, nil
			}

			ctx := context.Background()
			err := waitForTableStatus(ctx, mockClient, tc.tableName, "test_chapter", tc.wantStatus, tc.timeout)

			if tc.expectErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.errContains != "" && !contains(err.Error(), tc.errContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.errContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

// Benchmark tests.
func BenchmarkCheckTableStatus(b *testing.B) {
	mockDao := NewMockDAO()
	mockClient, _ := mockDao.DynamoClient.(*MockDynamoClient)

	mockClient.MockDescribeTable = func(ctx context.Context,
		input *dynamodb.DescribeTableInput,
		opts ...func(*dynamodb.Options),
	) (*dynamodb.DescribeTableOutput, error) {
		return &dynamodb.DescribeTableOutput{
			Table: &types.TableDescription{
				TableStatus: types.TableStatusActive,
			},
		}, nil
	}

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.CheckTableStatus(context.Background(), "benchmark_table")
	}
}

func BenchmarkIsResourceNotFound(b *testing.B) {
	err := &smithy.OperationError{
		Err: &types.ResourceNotFoundException{
			Message: aws.String("Not found"),
		},
	}

	b.ResetTimer()
	for range b.N {
		_ = isResourceNotFound(err)
	}
}
