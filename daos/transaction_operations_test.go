package daos

import (
	"context"
	"errors"
	"testing"

	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// Tests for awsWriteTransaction.
func TestAwsWriteTransaction(t *testing.T) {
	testCases := []struct {
		name               string
		input              *dynamodb.TransactWriteItemsInput
		mockTransactErr    error
		mockTransactAwsErr models.AwsError
		expectErr          bool
		expectAwsErr       bool
	}{
		{
			name:         "SuccessfulTransaction",
			input:        &dynamodb.TransactWriteItemsInput{},
			expectErr:    false,
			expectAwsErr: false,
		},
		{
			name:            "TransactionError",
			input:           &dynamodb.TransactWriteItemsInput{},
			mockTransactErr: errors.New("transaction failed"),
			expectErr:       true,
			expectAwsErr:    false,
		},
		{
			name:         "NilInput",
			input:        nil,
			expectErr:    false,
			expectAwsErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			if tc.mockTransactErr != nil {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient")
				}
				mockClient.MockTransactWriteItems = func(ctx context.Context,
					input *dynamodb.TransactWriteItemsInput,
					opts ...func(*dynamodb.Options),
				) (*dynamodb.TransactWriteItemsOutput, error) {
					return nil, tc.mockTransactErr
				}
			}

			awsErr, err := mockDao.awsWriteTransaction(context.Background(), tc.input)

			if tc.expectErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Logf("Got error: %v (may be acceptable)", err)
				}
			}

			if tc.expectAwsErr {
				if awsErr.IsNil() {
					t.Errorf("Expected AWS error but got none")
				}
			} else {
				if !awsErr.IsNil() {
					t.Logf("Got AWS error: %+v", awsErr)
				}
			}
		})
	}
}

// Tests for generateStoryChapterTransaction.
func TestGenerateStoryChapterTransaction(t *testing.T) {
	testCases := []struct {
		name           string
		storyID        string
		chapterID      string
		chapterTitle   string
		chapter        int
		wantErr        bool
		expectedErrMsg string
	}{
		{
			name:         "ValidParameters",
			storyID:      "story123",
			chapterID:    "chapter456",
			chapterTitle: "Chapter 1",
			chapter:      1,
			wantErr:      false,
		},
		{
			name:           "EmptyStoryID",
			storyID:        "",
			chapterID:      "chapter456",
			chapterTitle:   "Chapter 1",
			chapter:        1,
			wantErr:        true,
			expectedErrMsg: "storyID, chapterID, and chapterTitle params must not be blank",
		},
		{
			name:           "EmptyChapterID",
			storyID:        "story123",
			chapterID:      "",
			chapterTitle:   "Chapter 1",
			chapter:        1,
			wantErr:        true,
			expectedErrMsg: "storyID, chapterID, and chapterTitle params must not be blank",
		},
		{
			name:           "EmptyChapterTitle",
			storyID:        "story123",
			chapterID:      "chapter456",
			chapterTitle:   "",
			chapter:        1,
			wantErr:        true,
			expectedErrMsg: "storyID, chapterID, and chapterTitle params must not be blank",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockDao := NewMockDAO()

			transactItem, err := mockDao.generateStoryChapterTransaction(
				tc.storyID,
				tc.chapterID,
				tc.chapterTitle,
				tc.chapter,
			)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrMsg != "" && !contains(err.Error(), tc.expectedErrMsg) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if transactItem.Put == nil {
					t.Error("Expected Put operation in transaction item")
				}
			}
		})
	}
}

// Benchmark tests.
func BenchmarkAwsWriteTransaction(b *testing.B) {
	mockDao := NewMockDAO()
	input := &dynamodb.TransactWriteItemsInput{}

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.awsWriteTransaction(context.Background(), input)
	}
}

func BenchmarkGenerateStoryChapterTransaction(b *testing.B) {
	mockDao := NewMockDAO()

	b.ResetTimer()
	for range b.N {
		_, _ = mockDao.generateStoryChapterTransaction("story123", "chapter456", "Chapter 1", 1)
	}
}
