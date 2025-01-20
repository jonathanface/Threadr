package daos_test

import (
	"RichDocter/daos"
	"RichDocter/models"
	"fmt"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestWriteAssociations(t *testing.T) {
	txnCanceledErr := &types.TransactionCanceledException{
		CancellationReasons: []types.CancellationReason{
			{
				Code:    aws.String("ConditionalCheckFailed"),
				Message: aws.String("Example failure message"),
			},
		},
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "TransactWriteItems",
		Err:           txnCanceledErr,
	}

	testCases := []struct {
		name                   string // name of the test case
		email, storyOrSeriesID string // inputs
		setupMock              func(*daos.MockDynamoDBClient)
		associations           []*models.Association
		expectError            bool
	}{
		{
			"happy path",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Twice()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			false,
		},
		{
			"emtpy associations",
			"test@test.com",
			"12345",
			nil,
			[]*models.Association{},
			true,
		},
		{
			"non-aws error on update item",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, fmt.Errorf("some error")).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"aws error on update item",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, opErr).Once()

			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"non-aws error on update item details",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, fmt.Errorf("some error")).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"aws error on update item details",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, opErr).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dao := daos.NewMock()
			if tc.setupMock != nil {
				tc.setupMock(dao.DynamoClient.(*daos.MockDynamoDBClient))
			}
			results := dao.WriteAssociations(tc.email, tc.storyOrSeriesID, tc.associations)
			if tc.expectError {
				assert.Error(t, results)
			} else {
				assert.NoError(t, results)
			}
		})
	}
}

func TestUpdateAssociationPortraitEntryInDB(t *testing.T) {
	testCases := []struct {
		name                                       string // name of the test case
		email, storyOrSeriesID, associationID, url string // inputs
		setupMock                                  func(*daos.MockDynamoDBClient)
		expectError                                bool
	}{
		{
			"happy path",
			"test@test.com",
			"12345",
			"seriesID",
			"http://www.google.com",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("UpdateItem", mock.Anything, mock.AnythingOfType("*dynamodb.UpdateItemInput"), mock.Anything).Return(&dynamodb.UpdateItemOutput{}, nil).Once()
			},
			false,
		},
		{
			"db error",
			"test@test.com",
			"12345",
			"seriesID",
			"http://www.google.com",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("UpdateItem", mock.Anything, mock.AnythingOfType("*dynamodb.UpdateItemInput"), mock.Anything).Return(&dynamodb.UpdateItemOutput{}, fmt.Errorf("some error")).Once()
			},
			true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dao := daos.NewMock()
			if tc.setupMock != nil {
				tc.setupMock(dao.DynamoClient.(*daos.MockDynamoDBClient))
			}
			results := dao.UpdateAssociationPortraitEntryInDB(tc.email, tc.storyOrSeriesID, tc.associationID, tc.url)
			if tc.expectError {
				assert.Error(t, results)
			} else {
				assert.NoError(t, results)
			}
		})
	}
}

func TestDeleteAssociations(t *testing.T) {
	txnCanceledErr := &types.TransactionCanceledException{
		CancellationReasons: []types.CancellationReason{
			{
				Code:    aws.String("ConditionalCheckFailed"),
				Message: aws.String("Example failure message"),
			},
		},
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "TransactWriteItems",
		Err:           txnCanceledErr,
	}

	testCases := []struct {
		name           string // name of the test case
		email, storyID string // inputs
		setupMock      func(*daos.MockDynamoDBClient)
		associations   []*models.Association
		expectError    bool
	}{
		{
			"happy path",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"story": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Twice()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			false,
		},
		{
			"empty associations",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {},
			[]*models.Association{},
			true,
		},
		{
			"no such story",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, fmt.Errorf("some error")).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"non-aws error on delete item",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"story": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, fmt.Errorf("some error")).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"aws error on delete item",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"story": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, opErr).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"non-aws error on delete item details",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"story": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, fmt.Errorf("some error")).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
		{
			"aws error on delete item details",
			"test@test.com",
			"12345",
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"story": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, nil).Once()
				cl.On("TransactWriteItems", mock.Anything, mock.AnythingOfType("*dynamodb.TransactWriteItemsInput"), mock.Anything).Return(&dynamodb.TransactWriteItemsOutput{}, opErr).Once()
			},
			[]*models.Association{{
				ID: "1234",
			}},
			true,
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dao := daos.NewMock()
			if tc.setupMock != nil {
				tc.setupMock(dao.DynamoClient.(*daos.MockDynamoDBClient))
			}
			results := dao.DeleteAssociations(tc.email, tc.storyID, tc.associations)
			if tc.expectError {
				assert.Error(t, results)
			} else {
				assert.NoError(t, results)
			}
		})
	}
}

// GetStoryOrSeriesAssociations(email, storyID string, needDetails bool) ([]*models.Association, error) {
func TestGetStoryOrSeriesAssociations(t *testing.T) {
	// txnCanceledErr := &types.TransactionCanceledException{
	// 	CancellationReasons: []types.CancellationReason{
	// 		{
	// 			Code:    aws.String("ConditionalCheckFailed"),
	// 			Message: aws.String("Example failure message"),
	// 		},
	// 	},
	// }

	// opErr := &smithy.OperationError{
	// 	ServiceID:     "DynamoDB",
	// 	OperationName: "TransactWriteItems",
	// 	Err:           txnCanceledErr,
	// }

	testCases := []struct {
		name           string // name of the test case
		email, storyID string // inputs
		needDetails    bool
		setupMock      func(*daos.MockDynamoDBClient)
		expectError    bool
	}{
		{
			"happy path",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
			},
			false,
		},
		{
			"happy path with details",
			"test@test.com",
			"1234",
			true,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
			},
			false,
		},
		{
			"error retrieving story",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, fmt.Errorf("some error")).Once()

			},
			true,
		},
		{
			"error unmarshalling story",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{
					Items: []map[string]types.AttributeValue{
						{
							"story_id":   &types.AttributeValueMemberS{Value: "1"},
							"created_at": &types.AttributeValueMemberS{Value: "ThisShouldBeAnInt"}, // Intentionally incorrect
							"title":      &types.AttributeValueMemberS{Value: "Story Title"},
						},
					},
				}, nil).Once()
			},
			true,
		},
		{
			"error checking story in series",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, fmt.Errorf("check story in series err")).Once()
			},
			true,
		},
		{
			"error getting associations",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{
					Items: []map[string]types.AttributeValue{
						{
							"story_id": &types.AttributeValueMemberS{Value: "1"},
						},
					},
				}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, fmt.Errorf("fetch assoc error")).Once()
			},
			true,
		},
		{
			"error ummarshalling associations",
			"test@test.com",
			"1234",
			false,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{
					Items: []map[string]types.AttributeValue{
						{
							"story_id": &types.AttributeValueMemberS{Value: "1"},
						},
					},
				}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberM{
							Value: map[string]types.AttributeValue{
								"unexpected": &types.AttributeValueMemberS{Value: "wrongType"},
							},
						},
					},
				}}, nil).Once()
			},
			true,
		},
		{
			"details fetch associations error",
			"test@test.com",
			"1234",
			true,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberM{
							Value: map[string]types.AttributeValue{
								"unexpected": &types.AttributeValueMemberS{Value: "wrongType"},
							},
						},
					},
				}}, fmt.Errorf("fetch details error")).Once()
			},
			true,
		},
		{
			"unmarshal details error",
			"test@test.com",
			"1234",
			true,
			func(cl *daos.MockDynamoDBClient) {
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"user": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Twice()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, nil).Once()
				cl.On("Scan", mock.Anything, mock.AnythingOfType("*dynamodb.ScanInput"), mock.Anything).Return(&dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{
					{
						"association_id": &types.AttributeValueMemberS{Value: "1"},
					},
				}}, fmt.Errorf("fetch details error")).Once()
			},
			true,
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dao := daos.NewMock()
			if tc.setupMock != nil {
				tc.setupMock(dao.DynamoClient.(*daos.MockDynamoDBClient))
			}
			_, err := dao.GetStoryOrSeriesAssociationThumbnails(tc.email, tc.storyID, tc.needDetails)
			if tc.expectError {
				fmt.Println("err", err.Error())
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
