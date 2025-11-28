package daos

import (
	"RichDocter/models"
	"context"
	"errors"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Common errors for testing
var (
	ErrMockDAO = errors.New("mock dao error")
)

type MockDAO struct {
	*DAO
	MockGetUserDetails func(email string) (*models.UserInfo, error)
	MockUpsertUser     func(email string) (*models.UserInfo, error)

	// billing
	MockGetSubscription    func(email string) (*models.Subscription, error)
	MockUpdateSubscription func(s models.Subscription) error

	// API endpoint mocking functions
	MockCreateStory                             func(email string, story models.Story, newSeriesTitle string) (storyID string, err error)
	MockCreateChapter                           func(storyID string, chapter models.Chapter, email string) (models.Chapter, error)
	MockCreateOutline                           func(outline models.OutlineRequest) (*models.OutlineRequest, error)
	MockUpdateUser                              func(user models.UserInfo) error
	MockEditStory                               func(email string, story models.Story) (models.Story, error)
	MockEditSeries                              func(email string, series models.Series) (models.Series, error)
	MockRemoveStoryFromSeries                   func(email, storyID string, series models.Series) (models.Series, error)
	MockUpdateStorySettings                     func(email, storyID string, settings models.StorySettings) error
	MockEditChapter                             func(storyID string, chapter models.Chapter) (models.Chapter, error)
	MockResetBlockOrder                         func(storyID string, storyBlocks *models.StoryBlocks) error
	MockWriteBlocks                             func(storyID string, storyBlocks *models.StoryBlocks) error
	MockWriteAssociations                       func(email, storyOrSeriesID string, associations []*models.Association) error
	MockUpdateAssociationPortraitEntryInDB      func(email, storyOrSeriesID, associationID, url string) error
	MockUpdateOutline                           func(outline models.OutlineRequest) (*models.OutlineResponse, error)
	MockGetStoryByID                            func(email string, storyID string) (*models.Story, error)
	MockGetSeriesByID                           func(email string, seriesID string) (*models.Series, error)
	MockGetStoryOrSeriesAssociationThumbnails   func(email, storyID string) ([]*models.SimplifiedAssociation, error)
	MockIsStoryInASeries                        func(email string, storyID string) (string, error)
	MockGetChapterParagraphs                    func(storyID string, chapterID string, key *map[string]types.AttributeValue) (*models.BlocksData, error)
	MockGetAssociationDetails                   func(email, storyID, associationID string) (*models.Association, error)
	MockGetStorySettingsByID                    func(email string, storyID string) (*models.StorySettings, error)
	MockEditAssociation                         func(email, storyID string, association models.Association) (*models.Association, error)
	MockDeleteChapterParagraphs                 func(storyID string, storyBlocks *models.StoryBlocks) error
	MockDeleteAssociations                      func(email, storyID string, associations []*models.Association) error
	MockDeleteChapters                          func(storyID string, chapters []models.Chapter) error
	MockSoftDeleteStory                         func(email, storyID string, includeBlocks bool) error
	MockDeleteSeries                            func(email string, series models.Series) error
	MockGetChapterTableStatus                   func(storyID, chapterID string) (bool, error)
	MockGetChapterByID                          func(chapterID string) (*models.Chapter, error)
}

var _ DaoInterface = (*MockDAO)(nil)

func (m *MockDAO) GetUserDetails(email string) (*models.UserInfo, error) {
	if m.MockGetUserDetails != nil {
		return m.MockGetUserDetails(email)
	}
	// sensible default for tests:
	return &models.UserInfo{Email: email}, nil
}

func (m *MockDAO) UpsertUser(email string) (*models.UserInfo, error) {
	if m.MockUpsertUser != nil {
		return m.MockUpsertUser(email)
	}
	// sensible default for tests:
	return &models.UserInfo{Email: email}, nil
}

func (m *MockDAO) GetSubscription(email string) (*models.Subscription, error) {
	if m.MockGetSubscription != nil {
		return m.MockGetSubscription(email)
	}
	return &models.Subscription{}, nil
}

func (m *MockDAO) UpdateSubscription(sub models.Subscription) error {
	if m.MockUpdateSubscription != nil {
		return m.MockUpdateSubscription(sub)
	}
	return nil
}

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

// API endpoint mock method implementations
func (m *MockDAO) CreateStory(email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
	if m.MockCreateStory != nil {
		return m.MockCreateStory(email, story, newSeriesTitle)
	}
	return m.DAO.CreateStory(email, story, newSeriesTitle)
}

func (m *MockDAO) CreateChapter(storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
	if m.MockCreateChapter != nil {
		return m.MockCreateChapter(storyID, chapter, email)
	}
	return m.DAO.CreateChapter(storyID, chapter, email)
}

func (m *MockDAO) CreateOutline(outline models.OutlineRequest) (*models.OutlineRequest, error) {
	if m.MockCreateOutline != nil {
		return m.MockCreateOutline(outline)
	}
	return m.DAO.CreateOutline(outline)
}

func (m *MockDAO) UpdateUser(user models.UserInfo) error {
	if m.MockUpdateUser != nil {
		return m.MockUpdateUser(user)
	}
	return m.DAO.UpdateUser(user)
}

func (m *MockDAO) EditStory(email string, story models.Story) (models.Story, error) {
	if m.MockEditStory != nil {
		return m.MockEditStory(email, story)
	}
	return m.DAO.EditStory(email, story)
}

func (m *MockDAO) EditSeries(email string, series models.Series) (models.Series, error) {
	if m.MockEditSeries != nil {
		return m.MockEditSeries(email, series)
	}
	return m.DAO.EditSeries(email, series)
}

func (m *MockDAO) RemoveStoryFromSeries(email, storyID string, series models.Series) (models.Series, error) {
	if m.MockRemoveStoryFromSeries != nil {
		return m.MockRemoveStoryFromSeries(email, storyID, series)
	}
	return m.DAO.RemoveStoryFromSeries(email, storyID, series)
}

func (m *MockDAO) UpdateStorySettings(email, storyID string, settings models.StorySettings) error {
	if m.MockUpdateStorySettings != nil {
		return m.MockUpdateStorySettings(email, storyID, settings)
	}
	return m.DAO.UpdateStorySettings(email, storyID, settings)
}

func (m *MockDAO) EditChapter(storyID string, chapter models.Chapter) (models.Chapter, error) {
	if m.MockEditChapter != nil {
		return m.MockEditChapter(storyID, chapter)
	}
	return m.DAO.EditChapter(storyID, chapter)
}

func (m *MockDAO) ResetBlockOrder(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.MockResetBlockOrder != nil {
		return m.MockResetBlockOrder(storyID, storyBlocks)
	}
	return m.DAO.ResetBlockOrder(storyID, storyBlocks)
}

func (m *MockDAO) WriteBlocks(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.MockWriteBlocks != nil {
		return m.MockWriteBlocks(storyID, storyBlocks)
	}
	return m.DAO.WriteBlocks(storyID, storyBlocks)
}

func (m *MockDAO) WriteAssociations(email, storyOrSeriesID string, associations []*models.Association) error {
	if m.MockWriteAssociations != nil {
		return m.MockWriteAssociations(email, storyOrSeriesID, associations)
	}
	return m.DAO.WriteAssociations(email, storyOrSeriesID, associations)
}

func (m *MockDAO) UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url string) error {
	if m.MockUpdateAssociationPortraitEntryInDB != nil {
		return m.MockUpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url)
	}
	return m.DAO.UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url)
}

func (m *MockDAO) UpdateOutline(outline models.OutlineRequest) (*models.OutlineResponse, error) {
	if m.MockUpdateOutline != nil {
		return m.MockUpdateOutline(outline)
	}
	return m.DAO.UpdateOutline(outline)
}

func (m *MockDAO) GetStoryByID(email string, storyID string) (*models.Story, error) {
	if m.MockGetStoryByID != nil {
		return m.MockGetStoryByID(email, storyID)
	}
	return m.DAO.GetStoryByID(email, storyID)
}

func (m *MockDAO) GetSeriesByID(email string, seriesID string) (*models.Series, error) {
	if m.MockGetSeriesByID != nil {
		return m.MockGetSeriesByID(email, seriesID)
	}
	return m.DAO.GetSeriesByID(email, seriesID)
}

func (m *MockDAO) GetStoryOrSeriesAssociationThumbnails(email, storyID string) ([]*models.SimplifiedAssociation, error) {
	if m.MockGetStoryOrSeriesAssociationThumbnails != nil {
		return m.MockGetStoryOrSeriesAssociationThumbnails(email, storyID)
	}
	return m.DAO.GetStoryOrSeriesAssociationThumbnails(email, storyID)
}

func (m *MockDAO) IsStoryInASeries(email string, storyID string) (string, error) {
	if m.MockIsStoryInASeries != nil {
		return m.MockIsStoryInASeries(email, storyID)
	}
	return m.DAO.IsStoryInASeries(email, storyID)
}

func (m *MockDAO) GetChapterParagraphs(storyID string, chapterID string, key *map[string]types.AttributeValue) (*models.BlocksData, error) {
	if m.MockGetChapterParagraphs != nil {
		return m.MockGetChapterParagraphs(storyID, chapterID, key)
	}
	return m.DAO.GetChapterParagraphs(storyID, chapterID, key)
}

func (m *MockDAO) GetAssociationDetails(email, storyID, associationID string) (*models.Association, error) {
	if m.MockGetAssociationDetails != nil {
		return m.MockGetAssociationDetails(email, storyID, associationID)
	}
	return m.DAO.GetAssociationDetails(email, storyID, associationID)
}

func (m *MockDAO) GetStorySettingsByID(email string, storyID string) (*models.StorySettings, error) {
	if m.MockGetStorySettingsByID != nil {
		return m.MockGetStorySettingsByID(email, storyID)
	}
	return m.DAO.GetStorySettingsByID(email, storyID)
}

func (m *MockDAO) EditAssociation(email, storyID string, association models.Association) (*models.Association, error) {
	if m.MockEditAssociation != nil {
		return m.MockEditAssociation(email, storyID, association)
	}
	return &association, nil
}

func (m *MockDAO) DeleteChapterParagraphs(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.MockDeleteChapterParagraphs != nil {
		return m.MockDeleteChapterParagraphs(storyID, storyBlocks)
	}
	return m.DAO.DeleteChapterParagraphs(storyID, storyBlocks)
}

func (m *MockDAO) DeleteAssociations(email, storyID string, associations []*models.Association) error {
	if m.MockDeleteAssociations != nil {
		return m.MockDeleteAssociations(email, storyID, associations)
	}
	return m.DAO.DeleteAssociations(email, storyID, associations)
}

func (m *MockDAO) DeleteChapters(storyID string, chapters []models.Chapter) error {
	if m.MockDeleteChapters != nil {
		return m.MockDeleteChapters(storyID, chapters)
	}
	return m.DAO.DeleteChapters(storyID, chapters)
}

func (m *MockDAO) SoftDeleteStory(email, storyID string, includeBlocks bool) error {
	if m.MockSoftDeleteStory != nil {
		return m.MockSoftDeleteStory(email, storyID, includeBlocks)
	}
	return m.DAO.SoftDeleteStory(email, storyID, includeBlocks)
}

func (m *MockDAO) DeleteSeries(email string, series models.Series) error {
	if m.MockDeleteSeries != nil {
		return m.MockDeleteSeries(email, series)
	}
	return m.DAO.DeleteSeries(email, series)
}

func (m *MockDAO) GetChapterTableStatus(storyID, chapterID string) (bool, error) {
	if m.MockGetChapterTableStatus != nil {
		return m.MockGetChapterTableStatus(storyID, chapterID)
	}
	return m.DAO.GetChapterTableStatus(storyID, chapterID)
}

func (m *MockDAO) GetChapterByID(chapterID string) (*models.Chapter, error) {
	if m.MockGetChapterByID != nil {
		return m.MockGetChapterByID(chapterID)
	}
	return m.DAO.GetChapterByID(chapterID)
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
