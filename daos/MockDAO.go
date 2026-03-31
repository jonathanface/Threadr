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
	MockGetUserDetails        func(email string) (*models.UserInfo, error)
	MockUpsertUser            func(email string) (*models.UserInfo, error)
	MockGetAllUsersWithStories func() ([]models.AdminUserSummary, error)

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
	MockResetBlockOrder                         func(storyID string, blocksOrder *models.BlocksOrder) error
	MockWriteBlocks                             func(storyID string, storyBlocks *models.StoryBlocks) error
	MockWriteAssociations                       func(email, storyOrSeriesID string, associations []*models.Association) error
	MockUpdateAssociationPortraitEntryInDB      func(email, storyOrSeriesID, associationID, url string) error
	MockUpdateOutline                           func(outline models.OutlineRequest) (*models.OutlineResponse, error)
	MockGetStoryByID                            func(email string, storyID string) (*models.Story, error)
	MockGetSeriesByID                           func(email string, seriesID string) (*models.Series, error)
	MockGetSeriesVolumes                        func(email string, seriesID string) ([]*models.Story, error)
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
	MockDeleteUser                              func(email string) error
	MockGetChapterTableStatus                   func(storyID, chapterID string) (bool, error)
	MockGetChapterByID                          func(chapterID string) (*models.Chapter, error)
	MockWasStoryDeleted                         func(email, storyID string) (bool, error)

	// Sharing
	MockCreateShareLink        func(link models.ShareLink) error
	MockGetShareLink           func(token string) (*models.ShareLink, error)
	MockGetShareLinksByAuthor  func(email, storyID string) ([]models.ShareLink, error)
	MockGetShareLinksByStory   func(storyID string) ([]models.ShareLink, error)
	MockRevokeShareLink        func(token string) error
	MockRestoreShareLink       func(token string) error
	MockDeleteShareLink        func(token string) error

	// Email/Password Auth
	MockCreateEmailUser              func(email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error)
	MockSetEmailVerified             func(email string) error
	MockSetVerificationToken         func(email, token string, expires int64) error
	MockSetResetToken                func(email, token string, expires int64) error
	MockUpdatePassword               func(email, passwordHash string) error
	MockClearResetToken              func(email string) error
	MockLinkOAuthAccount             func(email, authType string) error
	MockFindUserByVerificationToken  func(token string) (*models.UserInfo, error)
	MockFindUserByResetToken         func(token string) (*models.UserInfo, error)

	// Alerts
	MockCreateAlert         func(alert models.Alert) error
	MockGetAlertsForUser    func(email string) ([]models.Alert, error)
	MockGetAlertReadsByUser func(email string) ([]models.AlertRead, error)
	MockMarkAlertRead       func(email, alertID string) error

	// Comments
	MockCreateComment              func(comment models.Comment) error
	MockGetComment                 func(commentID string) (*models.Comment, error)
	MockGetCommentsByShareToken    func(shareToken string) ([]models.Comment, error)
	MockGetCommentsByStoryChapter  func(storyID, chapterID string) ([]models.Comment, error)
	MockResolveComment             func(commentID string) error
	MockDeleteComment              func(commentID string) error
}

var _ DaoInterface = (*MockDAO)(nil)

func (m *MockDAO) GetUserDetails(ctx context.Context, email string) (*models.UserInfo, error) {
	if m.MockGetUserDetails != nil {
		return m.MockGetUserDetails(email)
	}
	// sensible default for tests:
	return &models.UserInfo{Email: email}, nil
}

func (m *MockDAO) GetAllUsersWithStories(ctx context.Context) ([]models.AdminUserSummary, error) {
	if m.MockGetAllUsersWithStories != nil {
		return m.MockGetAllUsersWithStories()
	}
	return []models.AdminUserSummary{}, nil
}

func (m *MockDAO) UpsertUser(ctx context.Context, email string) (*models.UserInfo, error) {
	if m.MockUpsertUser != nil {
		return m.MockUpsertUser(email)
	}
	// Fall back to real implementation to use mocked DynamoClient
	return m.DAO.UpsertUser(ctx, email)
}

func (m *MockDAO) GetSubscription(ctx context.Context, email string) (*models.Subscription, error) {
	if m.MockGetSubscription != nil {
		return m.MockGetSubscription(email)
	}
	return &models.Subscription{}, nil
}

func (m *MockDAO) UpdateSubscription(ctx context.Context, sub models.Subscription) error {
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
	MockGetItem                 func(ctx context.Context, input *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
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

// GetItem
func (m *MockDynamoClient) GetItem(ctx context.Context, input *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.MockGetItem != nil {
		return m.MockGetItem(ctx, input, optFns...)
	}
	return &dynamodb.GetItemOutput{}, nil
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
func (m *MockDAO) CreateStory(ctx context.Context, email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
	if m.MockCreateStory != nil {
		return m.MockCreateStory(email, story, newSeriesTitle)
	}
	return m.DAO.CreateStory(ctx, email, story, newSeriesTitle)
}

func (m *MockDAO) CreateChapter(ctx context.Context, storyID string, chapter models.Chapter, email string) (models.Chapter, error) {
	if m.MockCreateChapter != nil {
		return m.MockCreateChapter(storyID, chapter, email)
	}
	return m.DAO.CreateChapter(ctx, storyID, chapter, email)
}

func (m *MockDAO) CreateOutline(ctx context.Context, outline models.OutlineRequest) (*models.OutlineRequest, error) {
	if m.MockCreateOutline != nil {
		return m.MockCreateOutline(outline)
	}
	return m.DAO.CreateOutline(ctx, outline)
}

func (m *MockDAO) UpdateUser(ctx context.Context, user models.UserInfo) error {
	if m.MockUpdateUser != nil {
		return m.MockUpdateUser(user)
	}
	return m.DAO.UpdateUser(ctx, user)
}

func (m *MockDAO) EditStory(ctx context.Context, email string, story models.Story) (models.Story, error) {
	if m.MockEditStory != nil {
		return m.MockEditStory(email, story)
	}
	return m.DAO.EditStory(ctx, email, story)
}

func (m *MockDAO) EditSeries(ctx context.Context, email string, series models.Series) (models.Series, error) {
	if m.MockEditSeries != nil {
		return m.MockEditSeries(email, series)
	}
	return m.DAO.EditSeries(ctx, email, series)
}

func (m *MockDAO) RemoveStoryFromSeries(ctx context.Context, email, storyID string, series models.Series) (models.Series, error) {
	if m.MockRemoveStoryFromSeries != nil {
		return m.MockRemoveStoryFromSeries(email, storyID, series)
	}
	return m.DAO.RemoveStoryFromSeries(ctx, email, storyID, series)
}

func (m *MockDAO) UpdateStorySettings(ctx context.Context, email, storyID string, settings models.StorySettings) error {
	if m.MockUpdateStorySettings != nil {
		return m.MockUpdateStorySettings(email, storyID, settings)
	}
	return m.DAO.UpdateStorySettings(ctx, email, storyID, settings)
}

func (m *MockDAO) EditChapter(ctx context.Context, storyID string, chapter models.Chapter) (models.Chapter, error) {
	if m.MockEditChapter != nil {
		return m.MockEditChapter(storyID, chapter)
	}
	return m.DAO.EditChapter(ctx, storyID, chapter)
}

func (m *MockDAO) ResetBlockOrder(ctx context.Context, storyID string, blocksOrder *models.BlocksOrder) error {
	if m.MockResetBlockOrder != nil {
		return m.MockResetBlockOrder(storyID, blocksOrder)
	}
	return m.DAO.ResetBlockOrder(ctx, storyID, blocksOrder)
}

func (m *MockDAO) WriteBlocks(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) error {
	if m.MockWriteBlocks != nil {
		return m.MockWriteBlocks(storyID, storyBlocks)
	}
	return m.DAO.WriteBlocks(ctx, storyID, storyBlocks)
}

func (m *MockDAO) WriteAssociations(ctx context.Context, email, storyOrSeriesID string, associations []*models.Association) error {
	if m.MockWriteAssociations != nil {
		return m.MockWriteAssociations(email, storyOrSeriesID, associations)
	}
	return m.DAO.WriteAssociations(ctx, email, storyOrSeriesID, associations)
}

func (m *MockDAO) UpdateAssociationPortraitEntryInDB(ctx context.Context, email, storyOrSeriesID, associationID, url string) error {
	if m.MockUpdateAssociationPortraitEntryInDB != nil {
		return m.MockUpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url)
	}
	return m.DAO.UpdateAssociationPortraitEntryInDB(ctx, email, storyOrSeriesID, associationID, url)
}

func (m *MockDAO) UpdateOutline(ctx context.Context, outline models.OutlineRequest) (*models.OutlineResponse, error) {
	if m.MockUpdateOutline != nil {
		return m.MockUpdateOutline(outline)
	}
	return m.DAO.UpdateOutline(ctx, outline)
}

func (m *MockDAO) GetStoryByID(ctx context.Context, email string, storyID string) (*models.Story, error) {
	if m.MockGetStoryByID != nil {
		return m.MockGetStoryByID(email, storyID)
	}
	return m.DAO.GetStoryByID(ctx, email, storyID)
}

func (m *MockDAO) GetSeriesByID(ctx context.Context, email string, seriesID string) (*models.Series, error) {
	if m.MockGetSeriesByID != nil {
		return m.MockGetSeriesByID(email, seriesID)
	}
	return m.DAO.GetSeriesByID(ctx, email, seriesID)
}

func (m *MockDAO) GetSeriesVolumes(ctx context.Context, email string, seriesID string) ([]*models.Story, error) {
	if m.MockGetSeriesVolumes != nil {
		return m.MockGetSeriesVolumes(email, seriesID)
	}
	return m.DAO.GetSeriesVolumes(ctx, email, seriesID)
}

func (m *MockDAO) GetStoryOrSeriesAssociationThumbnails(ctx context.Context, email, storyID string) ([]*models.SimplifiedAssociation, error) {
	if m.MockGetStoryOrSeriesAssociationThumbnails != nil {
		return m.MockGetStoryOrSeriesAssociationThumbnails(email, storyID)
	}
	return m.DAO.GetStoryOrSeriesAssociationThumbnails(ctx, email, storyID)
}

func (m *MockDAO) IsStoryInASeries(ctx context.Context, email string, storyID string) (string, error) {
	if m.MockIsStoryInASeries != nil {
		return m.MockIsStoryInASeries(email, storyID)
	}
	return m.DAO.IsStoryInASeries(ctx, email, storyID)
}

func (m *MockDAO) GetChapterParagraphs(ctx context.Context, storyID string, chapterID string, key *map[string]types.AttributeValue) (*models.BlocksData, error) {
	if m.MockGetChapterParagraphs != nil {
		return m.MockGetChapterParagraphs(storyID, chapterID, key)
	}
	return m.DAO.GetChapterParagraphs(ctx, storyID, chapterID, key)
}

func (m *MockDAO) GetAssociationDetails(ctx context.Context, email, storyID, associationID string) (*models.Association, error) {
	if m.MockGetAssociationDetails != nil {
		return m.MockGetAssociationDetails(email, storyID, associationID)
	}
	return m.DAO.GetAssociationDetails(ctx, email, storyID, associationID)
}

func (m *MockDAO) GetStorySettingsByID(ctx context.Context, email string, storyID string) (*models.StorySettings, error) {
	if m.MockGetStorySettingsByID != nil {
		return m.MockGetStorySettingsByID(email, storyID)
	}
	return m.DAO.GetStorySettingsByID(ctx, email, storyID)
}

func (m *MockDAO) EditAssociation(ctx context.Context, email, storyID string, association models.Association) (*models.Association, error) {
	if m.MockEditAssociation != nil {
		return m.MockEditAssociation(email, storyID, association)
	}
	return &association, nil
}

func (m *MockDAO) DeleteChapterParagraphs(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) error {
	if m.MockDeleteChapterParagraphs != nil {
		return m.MockDeleteChapterParagraphs(storyID, storyBlocks)
	}
	return m.DAO.DeleteChapterParagraphs(ctx, storyID, storyBlocks)
}

func (m *MockDAO) DeleteAssociations(ctx context.Context, email, storyID string, associations []*models.Association) error {
	if m.MockDeleteAssociations != nil {
		return m.MockDeleteAssociations(email, storyID, associations)
	}
	return m.DAO.DeleteAssociations(ctx, email, storyID, associations)
}

func (m *MockDAO) DeleteChapters(ctx context.Context, storyID string, chapters []models.Chapter) error {
	if m.MockDeleteChapters != nil {
		return m.MockDeleteChapters(storyID, chapters)
	}
	return m.DAO.DeleteChapters(ctx, storyID, chapters)
}

func (m *MockDAO) SoftDeleteStory(ctx context.Context, email, storyID string, includeBlocks bool) error {
	if m.MockSoftDeleteStory != nil {
		return m.MockSoftDeleteStory(email, storyID, includeBlocks)
	}
	return m.DAO.SoftDeleteStory(ctx, email, storyID, includeBlocks)
}

func (m *MockDAO) DeleteSeries(ctx context.Context, email string, series models.Series) error {
	if m.MockDeleteSeries != nil {
		return m.MockDeleteSeries(email, series)
	}
	return m.DAO.DeleteSeries(ctx, email, series)
}

func (m *MockDAO) DeleteUser(ctx context.Context, email string) error {
	if m.MockDeleteUser != nil {
		return m.MockDeleteUser(email)
	}
	return m.DAO.DeleteUser(ctx, email)
}

func (m *MockDAO) GetChapterTableStatus(ctx context.Context, storyID, chapterID string) (bool, error) {
	if m.MockGetChapterTableStatus != nil {
		return m.MockGetChapterTableStatus(storyID, chapterID)
	}
	return m.DAO.GetChapterTableStatus(ctx, storyID, chapterID)
}

func (m *MockDAO) GetChapterByID(ctx context.Context, chapterID string) (*models.Chapter, error) {
	if m.MockGetChapterByID != nil {
		return m.MockGetChapterByID(chapterID)
	}
	return m.DAO.GetChapterByID(ctx, chapterID)
}

func (m *MockDAO) WasStoryDeleted(ctx context.Context, email, storyID string) (bool, error) {
	if m.MockWasStoryDeleted != nil {
		return m.MockWasStoryDeleted(email, storyID)
	}
	return m.DAO.WasStoryDeleted(ctx, email, storyID)
}

// Email/Password Auth mock implementations

func (m *MockDAO) CreateEmailUser(ctx context.Context, email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error) {
	if m.MockCreateEmailUser != nil {
		return m.MockCreateEmailUser(email, firstName, lastName, passwordHash, verificationToken, tokenExpires)
	}
	return &models.UserInfo{Email: email, FirstName: firstName, LastName: lastName, AuthType: "email"}, nil
}

func (m *MockDAO) SetEmailVerified(ctx context.Context, email string) error {
	if m.MockSetEmailVerified != nil {
		return m.MockSetEmailVerified(email)
	}
	return nil
}

func (m *MockDAO) SetVerificationToken(ctx context.Context, email, token string, expires int64) error {
	if m.MockSetVerificationToken != nil {
		return m.MockSetVerificationToken(email, token, expires)
	}
	return nil
}

func (m *MockDAO) SetResetToken(ctx context.Context, email, token string, expires int64) error {
	if m.MockSetResetToken != nil {
		return m.MockSetResetToken(email, token, expires)
	}
	return nil
}

func (m *MockDAO) UpdatePassword(ctx context.Context, email, passwordHash string) error {
	if m.MockUpdatePassword != nil {
		return m.MockUpdatePassword(email, passwordHash)
	}
	return nil
}

func (m *MockDAO) ClearResetToken(ctx context.Context, email string) error {
	if m.MockClearResetToken != nil {
		return m.MockClearResetToken(email)
	}
	return nil
}

func (m *MockDAO) LinkOAuthAccount(ctx context.Context, email, authType string) error {
	if m.MockLinkOAuthAccount != nil {
		return m.MockLinkOAuthAccount(email, authType)
	}
	return nil
}

func (m *MockDAO) RestoreDataForVerifiedUser(email string) {
	// no-op for tests
}

func (m *MockDAO) FindUserByVerificationToken(ctx context.Context, token string) (*models.UserInfo, error) {
	if m.MockFindUserByVerificationToken != nil {
		return m.MockFindUserByVerificationToken(token)
	}
	return &models.UserInfo{}, nil
}

func (m *MockDAO) FindUserByResetToken(ctx context.Context, token string) (*models.UserInfo, error) {
	if m.MockFindUserByResetToken != nil {
		return m.MockFindUserByResetToken(token)
	}
	return &models.UserInfo{}, nil
}

// Sharing mock implementations

func (m *MockDAO) CreateShareLink(ctx context.Context, link models.ShareLink) error {
	if m.MockCreateShareLink != nil {
		return m.MockCreateShareLink(link)
	}
	return nil
}

func (m *MockDAO) GetShareLink(ctx context.Context, token string) (*models.ShareLink, error) {
	if m.MockGetShareLink != nil {
		return m.MockGetShareLink(token)
	}
	return &models.ShareLink{Token: token}, nil
}

func (m *MockDAO) GetShareLinksByAuthor(ctx context.Context, email string, storyID string) ([]models.ShareLink, error) {
	if m.MockGetShareLinksByAuthor != nil {
		return m.MockGetShareLinksByAuthor(email, storyID)
	}
	return []models.ShareLink{}, nil
}

func (m *MockDAO) GetShareLinksByStory(ctx context.Context, storyID string) ([]models.ShareLink, error) {
	if m.MockGetShareLinksByStory != nil {
		return m.MockGetShareLinksByStory(storyID)
	}
	return []models.ShareLink{}, nil
}

func (m *MockDAO) RevokeShareLink(ctx context.Context, token string) error {
	if m.MockRevokeShareLink != nil {
		return m.MockRevokeShareLink(token)
	}
	return nil
}

func (m *MockDAO) RestoreShareLink(ctx context.Context, token string) error {
	if m.MockRestoreShareLink != nil {
		return m.MockRestoreShareLink(token)
	}
	return nil
}

func (m *MockDAO) DeleteShareLink(ctx context.Context, token string) error {
	if m.MockDeleteShareLink != nil {
		return m.MockDeleteShareLink(token)
	}
	return nil
}

// Comment mock implementations

func (m *MockDAO) CreateComment(ctx context.Context, comment models.Comment) error {
	if m.MockCreateComment != nil {
		return m.MockCreateComment(comment)
	}
	return nil
}

func (m *MockDAO) GetComment(ctx context.Context, commentID string) (*models.Comment, error) {
	if m.MockGetComment != nil {
		return m.MockGetComment(commentID)
	}
	return &models.Comment{CommentID: commentID}, nil
}

func (m *MockDAO) GetCommentsByShareToken(ctx context.Context, shareToken string) ([]models.Comment, error) {
	if m.MockGetCommentsByShareToken != nil {
		return m.MockGetCommentsByShareToken(shareToken)
	}
	return []models.Comment{}, nil
}

func (m *MockDAO) GetCommentsByStoryChapter(ctx context.Context, storyID, chapterID string) ([]models.Comment, error) {
	if m.MockGetCommentsByStoryChapter != nil {
		return m.MockGetCommentsByStoryChapter(storyID, chapterID)
	}
	return []models.Comment{}, nil
}

func (m *MockDAO) ResolveComment(ctx context.Context, commentID string) error {
	if m.MockResolveComment != nil {
		return m.MockResolveComment(commentID)
	}
	return nil
}

func (m *MockDAO) DeleteComment(ctx context.Context, commentID string) error {
	if m.MockDeleteComment != nil {
		return m.MockDeleteComment(commentID)
	}
	return nil
}

// Alert mock implementations

func (m *MockDAO) CreateAlert(ctx context.Context, alert models.Alert) error {
	if m.MockCreateAlert != nil {
		return m.MockCreateAlert(alert)
	}
	return nil
}

func (m *MockDAO) GetAlertsForUser(ctx context.Context, email string) ([]models.Alert, error) {
	if m.MockGetAlertsForUser != nil {
		return m.MockGetAlertsForUser(email)
	}
	return []models.Alert{}, nil
}

func (m *MockDAO) GetAlertReadsByUser(ctx context.Context, email string) ([]models.AlertRead, error) {
	if m.MockGetAlertReadsByUser != nil {
		return m.MockGetAlertReadsByUser(email)
	}
	return []models.AlertRead{}, nil
}

func (m *MockDAO) MarkAlertRead(ctx context.Context, email, alertID string) error {
	if m.MockMarkAlertRead != nil {
		return m.MockMarkAlertRead(email, alertID)
	}
	return nil
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
