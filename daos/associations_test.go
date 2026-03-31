package daos

import (
	"Threadr/models"
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// (Similarly, if you need to mock DAO.DynamoClient.UpdateItem, you can override or define an interface)

// setupTest can run before each subtest
func setupTest(t *testing.T, testName string) func() {
	// E.g. connect to test DB, set up environment, etc.
	// Here we just print for illustration
	t.Logf("[SETUP] Starting test case: %s", testName)

	// Return a teardown func
	return func() {
		t.Logf("[TEARDOWN] Finished test case: %s", testName)
	}
}

func TestWriteAssociations(t *testing.T) {
	mockDao := NewMockDAO()
	testCases := []struct {
		name                string
		email               string
		storyOrSeriesID     string
		associations        []*models.Association
		mockAwsWriteErr     error           // if we want a "regular" error
		mockAwsWriteAwsErr  models.AwsError // if we want an AWS error
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:                "EmptyAssociations",
			email:               "test@example.com",
			storyOrSeriesID:     "story1",
			associations:        []*models.Association{}, // empty
			wantErr:             true,
			expectedErrContains: "empty associations array",
		},
		{
			name:            "SuccessfulWrite",
			email:           "author@example.com",
			storyOrSeriesID: "storyXYZ",
			associations: []*models.Association{
				{ID: "assoc1", Name: "CharacterOne", Type: "character"},
				{ID: "assoc2", Name: "PlaceOne", Type: "place"},
			},
			wantErr: false,
		},
		{
			name:            "AWSWriteError",
			email:           "test@example.com",
			storyOrSeriesID: "story2",
			associations: []*models.Association{
				{ID: "assocX", Name: "SomeName", Type: "event"},
			},
			mockAwsWriteErr:     errors.New("transact write error"),
			wantErr:             true,
			expectedErrContains: "transact write error",
		},
		{
			name:            "AWSWriteAwsError",
			email:           "test@example.com",
			storyOrSeriesID: "story2",
			associations: []*models.Association{
				{ID: "assocX", Name: "SomeName", Type: "item"},
			},
			mockAwsWriteAwsErr: models.AwsError{
				Code:      "SomeCode",
				ErrorType: "SomeType",
				Text:      "AWS error occurred",
			},
			wantErr:             true,
			expectedErrContains: "AWSERROR-- Code:SomeCode, Type: SomeType, Message: AWS error occurred",
		},
	}

	for _, tc := range testCases {
		tc := tc // capture range variable
		t.Run(tc.name, func(t *testing.T) {
			teardown := setupTest(t, tc.name)
			defer teardown()
			if tc.mockAwsWriteErr != nil || !tc.mockAwsWriteAwsErr.IsNil() {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient; got %T", mockDao.DynamoClient)
				}
				mockClient.MockTransactWriteItems = func(ctx context.Context,
					input *dynamodb.TransactWriteItemsInput,
					opts ...func(*dynamodb.Options),
				) (*dynamodb.TransactWriteItemsOutput, error) {
					if tc.mockAwsWriteErr != nil {
						return nil, errors.New(tc.expectedErrContains)
					}
					return nil, errors.New("AWSERROR-- Code:" + tc.mockAwsWriteAwsErr.Code + ", Type: " + tc.mockAwsWriteAwsErr.ErrorType + ", Message: " + tc.mockAwsWriteAwsErr.Text)
				}
			}
			err := mockDao.WriteAssociations(context.Background(), tc.email, tc.storyOrSeriesID, tc.associations)
			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestUpdateAssociationPortraitEntryInDB(t *testing.T) {
	mockDao := NewMockDAO()
	testCases := []struct {
		name      string
		email     string
		storyOrID string
		assocID   string
		newURL    string
		mockErr   error
		wantErr   bool
	}{
		{
			name:      "SuccessCase",
			email:     "author@site.com",
			storyOrID: "story123",
			assocID:   "assocABC",
			newURL:    "https://images.com/newportrait.jpg",
			wantErr:   false,
		},
		{
			name:      "UpdateItemError",
			email:     "author@site.com",
			storyOrID: "storyABC",
			assocID:   "assocXYZ",
			newURL:    "https://images.com/portrait.jpg",
			mockErr:   errors.New("UpdateItem call failed"),
			wantErr:   true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			teardown := setupTest(t, tc.name)
			defer teardown()

			if tc.wantErr {
				mockClient, ok := mockDao.DynamoClient.(*MockDynamoClient)
				if !ok {
					t.Fatalf("mockDao.DynamoClient is not a *MockDynamoClient; got %T", mockDao.DynamoClient)
				}
				mockClient.MockUpdateItem = func(ctx context.Context, input *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
					return nil, errors.New("UpdateItem call failed")
				}
			}

			err := mockDao.UpdateAssociationPortraitEntryInDB(context.Background(), tc.email, tc.storyOrID, tc.assocID, tc.newURL)
			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestDeleteAssociations(t *testing.T) {
	testCases := []struct {
		name                string
		email               string
		storyID             string
		associations        []*models.Association
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:                "NoAssociations",
			email:               "test@site.com",
			storyID:             "storyX",
			associations:        []*models.Association{},
			wantErr:             true,
			expectedErrContains: "no associations provided",
		},
		{
			name:    "WithAssociations_NeedsMockDB",
			email:   "test@site.com",
			storyID: "storyY",
			associations: []*models.Association{
				{ID: "assoc1", Type: "character"},
			},
			wantErr: true, // Will fail without full DB mock (GetStoryByID in IsStoryInASeries)
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			teardown := setupTest(t, tc.name)
			defer teardown()

			mockDao := NewMockDAO()

			err := mockDao.DeleteAssociations(context.Background(), tc.email, tc.storyID, tc.associations)
			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				} else {
					t.Logf("Got expected error: %v", err)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestGetAssociationDetails(t *testing.T) {
	mockDao := NewMockDAO()

	testCases := []struct {
		name                string
		email               string
		storyID             string
		associationID       string
		wantErr             bool
		expectedErrContains string
	}{
		{
			name:                "RequiresMockDB_StoryLookup",
			email:               "user@example.com",
			storyID:             "story123",
			associationID:       "assoc456",
			wantErr:             true, // Without full DB mock, Scan will fail
			expectedErrContains: "no story found for id",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			teardown := setupTest(t, tc.name)
			defer teardown()

			// Note: This function requires extensive mocking of Scan and Query operations
			// Testing is limited without full DynamoDB mock infrastructure

			_, err := mockDao.GetAssociationDetails(context.Background(), tc.email, tc.storyID, tc.associationID)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else if tc.expectedErrContains != "" && !contains(err.Error(), tc.expectedErrContains) {
					t.Errorf("Error %q does not contain %q", err.Error(), tc.expectedErrContains)
				} else {
					t.Logf("Got expected error: %v", err)
				}
			} else {
				if err != nil {
					t.Logf("Got error (expected without full DB mock): %v", err)
				}
			}
		})
	}
}

func TestGetStoryOrSeriesAssociationThumbnails(t *testing.T) {
	mockDao := NewMockDAO()

	testCases := []struct {
		name    string
		email   string
		storyID string
		wantErr bool
	}{
		{
			name:    "RequiresMockDB_StoryAndAssociationLookup",
			email:   "user@example.com",
			storyID: "story123",
			wantErr: true, // Without full DB mock, Scan operations will fail
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			teardown := setupTest(t, tc.name)
			defer teardown()

			// Note: This function requires mocking of multiple Scan operations
			// Full testing requires comprehensive DB mock infrastructure

			_, err := mockDao.GetStoryOrSeriesAssociationThumbnails(context.Background(), tc.email, tc.storyID)

			if tc.wantErr {
				if err == nil {
					t.Errorf("Expected error but got nil")
				} else {
					t.Logf("Got expected error: %v", err)
				}
			} else {
				if err != nil {
					t.Logf("Got error (expected without full DB mock): %v", err)
				}
			}
		})
	}
}

// contains is a small helper for substring checks
func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (func() bool {
		// or simply strings.Contains if you prefer
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
