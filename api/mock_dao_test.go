package api

import (
	"context"
	"errors"

	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// MockDAO is a mock implementation of daos.DaoInterface for testing.
type MockDAO struct {
	// Function fields to customize behavior per test
	GetUserDetailsFunc                        func(email string) (*models.UserInfo, error)
	UpdateUserFunc                            func(user models.UserInfo) error
	GetStoryByIDFunc                          func(email string, storyID string) (*models.Story, error)
	GetSeriesByIDFunc                         func(email string, seriesID string) (*models.Series, error)
	EditStoryFunc                             func(email string, story models.Story) (models.Story, error)
	EditSeriesFunc                            func(email string, series models.Series) (models.Series, error)
	RemoveStoryFromSeriesFunc                 func(email, storyID string, series models.Series) (models.Series, error)
	UpdateStorySettingsFunc                   func(email, storyID string, settings models.StorySettings) error
	EditChapterFunc                           func(storyID string, chapter models.Chapter) (models.Chapter, error)
	ResetBlockOrderFunc                       func(storyID string, storyBlocks *models.StoryBlocks) error
	WriteBlocksFunc                           func(storyID string, storyBlocks *models.StoryBlocks) error
	WriteAssociationsFunc                     func(email, storyOrSeriesID string, associations []*models.Association) error
	EditAssociationFunc                       func(email, storyID string, association models.Association) (*models.Association, error)
	IsStoryInASeriesFunc                      func(email string, storyID string) (string, error)
	UpdateAssociationPortraitEntryInDBFunc    func(email, storyOrSeriesID, associationID, url string) error
	UpdateOutlineFunc                         func(outline models.OutlineRequest) (*models.OutlineResponse, error)
	CreateStoryFunc                           func(email string, story models.Story, newSeriesTitle string) (storyID string, err error)
	CreateChapterFunc                         func(storyID string, chapter models.Chapter) (models.Chapter, error)
	CreateOutlineFunc                         func(outline models.OutlineRequest) (*models.OutlineRequest, error)
	GetChapterParagraphsFunc                  func(storyID string, chapterID string, key *map[string]types.AttributeValue) (*models.BlocksData, error)
	GetStoryBlocksFunc                        func(storyID, chapterID string, exclusiveStartKey *map[string]types.AttributeValue) (*models.BlocksData, error)
	GetAssociationFunc                        func(email, storyID, associationID string) (*models.Association, error)
	GetStoryOrSeriesAssociationThumbnailsFunc func(email, storyID string) ([]*models.SimplifiedAssociation, error)
	GetAllStoriesFunc                         func(email string) ([]*models.Story, error)
	GetAllStandaloneFunc                      func(email string) ([]models.Story, error)
	GetAllSeriesWithStoriesFunc               func(email string) ([]models.Series, error)
	GetChaptersByStoryIDFunc                  func(storyID string) ([]models.Chapter, error)
	GetStorySettingsByIDFunc                  func(email string, storyID string) (*models.StorySettings, error)
	GetStorySettingsFunc                      func(storyID string) (*models.StorySettings, error)
	GetStoryCountByUserFunc                   func(email string) (int, error)
	GetAssociationDetailsFunc                 func(email, storyID, associationID string) (*models.Association, error)
	GetSeriesVolumesFunc                      func(seriesID string) ([]*models.Story, error)
	GetChapterByIDFunc                        func(chapterID string) (*models.Chapter, error)
	GetOutlineByStoryIDFunc                   func(storyID string, chapters []models.Chapter) (*models.OutlineResponse, error)
	GetChapterTableStatusFunc                 func() (bool, error)
	GetSubscriptionFunc                       func(email string) (*models.Subscription, error)
	GetEmailByCustomerIDFunc                  func(customerID string) (string, error)
	UpsertUserFunc                            func(email string) (*models.UserInfo, error)
	RestoreAutomaticallyDeletedStoriesFunc    func(ctx context.Context, email string) (<-chan daos.RestoreStoryEvent, error)
	AddCustomerIDFunc                         func(email, customerID *string) error
	AddStripeDataFunc                         func(email, subscriptionID, customerID *string) error
	DeleteChapterParagraphsFunc               func(storyID string, storyBlocks *models.StoryBlocks) error
	DeleteAssociationsFunc                    func(email, storyID string, associations []*models.Association) error
	DeleteChaptersFunc                        func(storyID string, chapters []models.Chapter) error
	SoftDeleteStoryFunc                       func(email, storyID string, isAutomated bool) error
	DeleteSeriesFunc                          func(email string, series models.Series) error
	WasStoryDeletedFunc                       func(email string, storyID string) (bool, error)
	IsUserSubscribedFunc                      func(models.UserInfo) (*models.UserInfo, error)
	GetTotalCreatedStoriesFunc                func(email string) (int, error)
	CheckForSuspendedStoriesFunc              func(email string) (bool, error)
	CheckTableStatusFunc                      func(tableName string) (string, error)
	UpdateSubscriptionFunc                    func(subscription models.Subscription) error
	CreateUserFunc                            func(email string) (*models.UserInfo, error)
	CreateShareLinkFunc                       func(link models.ShareLink) error
	GetShareLinkFunc                          func(token string) (*models.ShareLink, error)
	GetShareLinksByAuthorFunc                 func(email, storyID string) ([]models.ShareLink, error)
	GetShareLinksByStoryFunc                  func(storyID string) ([]models.ShareLink, error)
	RevokeShareLinkFunc                       func(token string) error
	RestoreShareLinkFunc                      func(token string) error
	DeleteShareLinkFunc                       func(token string) error
	CreateCommentFunc                         func(comment models.Comment) error
	GetCommentFunc                            func(commentID string) (*models.Comment, error)
	GetCommentsByShareTokenFunc               func(shareToken string) ([]models.Comment, error)
	GetCommentsByStoryChapterFunc             func(storyID, chapterID string) ([]models.Comment, error)
	ResolveCommentFunc                        func(commentID string) error
	DeleteCommentFunc                         func(commentID string) error
	DeleteUserFunc                            func(email string) error
	GetAllUsersWithStoriesFunc                func() ([]models.AdminUserSummary, error)
	GetChaptersByStoryIDsFunc                 func(storyIDs []string) (map[string][]models.Chapter, error)

	// Alerts
	CreateAlertFunc         func(alert models.Alert) error
	GetAlertsForUserFunc    func(email string) ([]models.Alert, error)
	GetAlertReadsByUserFunc func(email string) ([]models.AlertRead, error)
	MarkAlertReadFunc       func(email, alertID string) error

	// Email auth
	CreateEmailUserFunc             func(email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error)
	SetEmailVerifiedFunc            func(email string) error
	SetVerificationTokenFunc        func(email, token string, expires int64) error
	SetResetTokenFunc               func(email, token string, expires int64) error
	UpdatePasswordFunc              func(email, passwordHash string) error
	ClearResetTokenFunc             func(email string) error
	LinkOAuthAccountFunc            func(email, authType string) error
	FindUserByVerificationTokenFunc func(token string) (*models.UserInfo, error)
	FindUserByResetTokenFunc        func(token string) (*models.UserInfo, error)
}

// Note: We cannot enforce interface implementation at compile time due to unexported methods
// var _ daos.DaoInterface = (*MockDAO)(nil)

// GetAllStories mock implementation.
func (m *MockDAO) GetAllStories(email string) ([]*models.Story, error) {
	if m.GetAllStoriesFunc != nil {
		return m.GetAllStoriesFunc(email)
	}
	return []*models.Story{}, nil
}

// GetAllStandalone mock implementation.
func (m *MockDAO) GetAllStandalone(email string) ([]models.Story, error) {
	if m.GetAllStandaloneFunc != nil {
		return m.GetAllStandaloneFunc(email)
	}
	return []models.Story{}, nil
}

// GetAllSeriesWithStories mock implementation.
func (m *MockDAO) GetAllSeriesWithStories(email string) ([]models.Series, error) {
	if m.GetAllSeriesWithStoriesFunc != nil {
		return m.GetAllSeriesWithStoriesFunc(email)
	}
	return []models.Series{}, nil
}

// GetChaptersByStoryID mock implementation.
func (m *MockDAO) GetChaptersByStoryID(storyID string) ([]models.Chapter, error) {
	if m.GetChaptersByStoryIDFunc != nil {
		return m.GetChaptersByStoryIDFunc(storyID)
	}
	return []models.Chapter{}, nil
}

// GetStoryByID mock implementation.
func (m *MockDAO) GetStoryByID(email string, storyID string) (*models.Story, error) {
	if m.GetStoryByIDFunc != nil {
		return m.GetStoryByIDFunc(email, storyID)
	}
	return &models.Story{ID: storyID, Title: "Test Story"}, nil
}

// GetStorySettingsByID mock implementation.
func (m *MockDAO) GetStorySettingsByID(email string, storyID string) (*models.StorySettings, error) {
	if m.GetStorySettingsByIDFunc != nil {
		return m.GetStorySettingsByIDFunc(email, storyID)
	}
	return &models.StorySettings{}, nil
}

// GetStorySettings mock implementation.
func (m *MockDAO) GetStorySettings(storyID string) (*models.StorySettings, error) {
	if m.GetStorySettingsFunc != nil {
		return m.GetStorySettingsFunc(storyID)
	}
	return &models.StorySettings{}, nil
}

// GetSeriesByID mock implementation.
func (m *MockDAO) GetSeriesByID(email string, seriesID string) (*models.Series, error) {
	if m.GetSeriesByIDFunc != nil {
		return m.GetSeriesByIDFunc(email, seriesID)
	}
	return &models.Series{ID: seriesID, Title: "Test Series"}, nil
}

// GetStoryCountByUser mock implementation.
func (m *MockDAO) GetStoryCountByUser(email string) (int, error) {
	if m.GetStoryCountByUserFunc != nil {
		return m.GetStoryCountByUserFunc(email)
	}
	return 0, nil
}

// GetChapterParagraphs mock implementation.
func (m *MockDAO) GetChapterParagraphs(
	storyID string,
	chapterID string,
	key *map[string]types.AttributeValue,
) (*models.BlocksData, error) {
	if m.GetChapterParagraphsFunc != nil {
		return m.GetChapterParagraphsFunc(storyID, chapterID, key)
	}
	return &models.BlocksData{Items: []map[string]types.AttributeValue{}}, nil
}

// GetStoryBlocks mock implementation.
func (m *MockDAO) GetStoryBlocks(
	storyID, chapterID string,
	exclusiveStartKey *map[string]types.AttributeValue,
) (*models.BlocksData, error) {
	if m.GetStoryBlocksFunc != nil {
		return m.GetStoryBlocksFunc(storyID, chapterID, exclusiveStartKey)
	}
	return &models.BlocksData{Items: []map[string]types.AttributeValue{}}, nil
}

// GetAssociation mock implementation.
func (m *MockDAO) GetAssociation(email, storyID, associationID string) (*models.Association, error) {
	if m.GetAssociationFunc != nil {
		return m.GetAssociationFunc(email, storyID, associationID)
	}
	return &models.Association{ID: associationID, Name: "Test Association"}, nil
}

// GetStoryOrSeriesAssociationThumbnails mock implementation.
func (m *MockDAO) GetStoryOrSeriesAssociationThumbnails(
	email, storyID string,
) ([]*models.SimplifiedAssociation, error) {
	if m.GetStoryOrSeriesAssociationThumbnailsFunc != nil {
		return m.GetStoryOrSeriesAssociationThumbnailsFunc(email, storyID)
	}
	return []*models.SimplifiedAssociation{}, nil
}

// GetAssociationDetails mock implementation.
func (m *MockDAO) GetAssociationDetails(email, storyID, associationID string) (*models.Association, error) {
	if m.GetAssociationDetailsFunc != nil {
		return m.GetAssociationDetailsFunc(email, storyID, associationID)
	}
	return &models.Association{}, nil
}

// GetSeriesVolumes mock implementation.
func (m *MockDAO) GetSeriesVolumes(seriesID string) ([]*models.Story, error) {
	if m.GetSeriesVolumesFunc != nil {
		return m.GetSeriesVolumesFunc(seriesID)
	}
	return []*models.Story{}, nil
}

// GetUserDetails mock implementation.
func (m *MockDAO) GetUserDetails(email string) (*models.UserInfo, error) {
	if m.GetUserDetailsFunc != nil {
		return m.GetUserDetailsFunc(email)
	}
	return &models.UserInfo{Email: email}, nil
}

// GetChapterByID mock implementation.
func (m *MockDAO) GetChapterByID(chapterID string) (*models.Chapter, error) {
	if m.GetChapterByIDFunc != nil {
		return m.GetChapterByIDFunc(chapterID)
	}
	return &models.Chapter{ID: chapterID}, nil
}

// GetOutlineByStoryID mock implementation.
func (m *MockDAO) GetOutlineByStoryID(storyID string, chapters []models.Chapter) (*models.OutlineResponse, error) {
	if m.GetOutlineByStoryIDFunc != nil {
		return m.GetOutlineByStoryIDFunc(storyID, chapters)
	}
	return &models.OutlineResponse{}, nil
}

// GetChapterTableStatus mock implementation.
func (m *MockDAO) GetChapterTableStatus() (bool, error) {
	if m.GetChapterTableStatusFunc != nil {
		return m.GetChapterTableStatusFunc()
	}
	return true, nil
}

// GetSubscription mock implementation.
func (m *MockDAO) GetSubscription(email string) (*models.Subscription, error) {
	if m.GetSubscriptionFunc != nil {
		return m.GetSubscriptionFunc(email)
	}
	return &models.Subscription{}, nil
}

// GetEmailByCustomerID mock implementation.
func (m *MockDAO) GetEmailByCustomerID(customerID string) (string, error) {
	if m.GetEmailByCustomerIDFunc != nil {
		return m.GetEmailByCustomerIDFunc(customerID)
	}
	return "", nil
}

// UpsertUser mock implementation.
func (m *MockDAO) UpsertUser(email string) (*models.UserInfo, error) {
	if m.UpsertUserFunc != nil {
		return m.UpsertUserFunc(email)
	}
	return &models.UserInfo{Email: email}, nil
}

// UpdateUser mock implementation.
func (m *MockDAO) UpdateUser(user models.UserInfo) error {
	if m.UpdateUserFunc != nil {
		return m.UpdateUserFunc(user)
	}
	return nil
}

// RestoreAutomaticallyDeletedStories mock implementation.
func (m *MockDAO) RestoreAutomaticallyDeletedStories(
	ctx context.Context,
	email string,
) (<-chan daos.RestoreStoryEvent, error) {
	if m.RestoreAutomaticallyDeletedStoriesFunc != nil {
		return m.RestoreAutomaticallyDeletedStoriesFunc(ctx, email)
	}
	ch := make(chan daos.RestoreStoryEvent)
	close(ch)
	return ch, nil
}

// ResetBlockOrder mock implementation.
func (m *MockDAO) ResetBlockOrder(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.ResetBlockOrderFunc != nil {
		return m.ResetBlockOrderFunc(storyID, storyBlocks)
	}
	return nil
}

// WriteBlocks mock implementation.
func (m *MockDAO) WriteBlocks(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.WriteBlocksFunc != nil {
		return m.WriteBlocksFunc(storyID, storyBlocks)
	}
	return nil
}

// WriteAssociations mock implementation.
func (m *MockDAO) WriteAssociations(email, storyOrSeriesID string, associations []*models.Association) error {
	if m.WriteAssociationsFunc != nil {
		return m.WriteAssociationsFunc(email, storyOrSeriesID, associations)
	}
	return nil
}

// UpdateAssociationPortraitEntryInDB mock implementation.
func (m *MockDAO) UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url string) error {
	if m.UpdateAssociationPortraitEntryInDBFunc != nil {
		return m.UpdateAssociationPortraitEntryInDBFunc(email, storyOrSeriesID, associationID, url)
	}
	return nil
}

// AddCustomerID mock implementation.
func (m *MockDAO) AddCustomerID(email, customerID *string) error {
	if m.AddCustomerIDFunc != nil {
		return m.AddCustomerIDFunc(email, customerID)
	}
	return nil
}

// AddStripeData mock implementation.
func (m *MockDAO) AddStripeData(email, subscriptionID, customerID *string) error {
	if m.AddStripeDataFunc != nil {
		return m.AddStripeDataFunc(email, subscriptionID, customerID)
	}
	return nil
}

// EditStory mock implementation.
func (m *MockDAO) EditStory(email string, story models.Story) (models.Story, error) {
	if m.EditStoryFunc != nil {
		return m.EditStoryFunc(email, story)
	}
	return story, nil
}

// UpdateStorySettings mock implementation.
func (m *MockDAO) UpdateStorySettings(email, storyID string, settings models.StorySettings) error {
	if m.UpdateStorySettingsFunc != nil {
		return m.UpdateStorySettingsFunc(email, storyID, settings)
	}
	return nil
}

// EditSeries mock implementation.
func (m *MockDAO) EditSeries(email string, series models.Series) (models.Series, error) {
	if m.EditSeriesFunc != nil {
		return m.EditSeriesFunc(email, series)
	}
	return series, nil
}

// EditChapter mock implementation.
func (m *MockDAO) EditChapter(storyID string, chapter models.Chapter) (models.Chapter, error) {
	if m.EditChapterFunc != nil {
		return m.EditChapterFunc(storyID, chapter)
	}
	return chapter, nil
}

// EditAssociation mock implementation.
func (m *MockDAO) EditAssociation(email, storyID string, association models.Association) (*models.Association, error) {
	if m.EditAssociationFunc != nil {
		return m.EditAssociationFunc(email, storyID, association)
	}
	return &association, nil
}

// RemoveStoryFromSeries mock implementation.
func (m *MockDAO) RemoveStoryFromSeries(email, storyID string, series models.Series) (models.Series, error) {
	if m.RemoveStoryFromSeriesFunc != nil {
		return m.RemoveStoryFromSeriesFunc(email, storyID, series)
	}
	return series, nil
}

// UpdateOutline mock implementation.
func (m *MockDAO) UpdateOutline(outline models.OutlineRequest) (*models.OutlineResponse, error) {
	if m.UpdateOutlineFunc != nil {
		return m.UpdateOutlineFunc(outline)
	}
	return &models.OutlineResponse{}, nil
}

// UpdateSubscription mock implementation.
func (m *MockDAO) UpdateSubscription(subscription models.Subscription) error {
	if m.UpdateSubscriptionFunc != nil {
		return m.UpdateSubscriptionFunc(subscription)
	}
	return nil
}

// CreateChapter mock implementation.
func (m *MockDAO) CreateChapter(storyID string, chapter models.Chapter) (models.Chapter, error) {
	if m.CreateChapterFunc != nil {
		return m.CreateChapterFunc(storyID, chapter)
	}
	return chapter, nil
}

// CreateStory mock implementation.
func (m *MockDAO) CreateStory(email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
	if m.CreateStoryFunc != nil {
		return m.CreateStoryFunc(email, story, newSeriesTitle)
	}
	return story.ID, nil
}

// CreateUser mock implementation.
func (m *MockDAO) CreateUser(email string) (*models.UserInfo, error) {
	if m.CreateUserFunc != nil {
		return m.CreateUserFunc(email)
	}
	return &models.UserInfo{Email: email}, nil
}

// CreateOutline mock implementation.
func (m *MockDAO) CreateOutline(outline models.OutlineRequest) (*models.OutlineRequest, error) {
	if m.CreateOutlineFunc != nil {
		return m.CreateOutlineFunc(outline)
	}
	return &outline, nil
}

// DeleteChapterParagraphs mock implementation.
func (m *MockDAO) DeleteChapterParagraphs(storyID string, storyBlocks *models.StoryBlocks) error {
	if m.DeleteChapterParagraphsFunc != nil {
		return m.DeleteChapterParagraphsFunc(storyID, storyBlocks)
	}
	return nil
}

// DeleteAssociations mock implementation.
func (m *MockDAO) DeleteAssociations(email, storyID string, associations []*models.Association) error {
	if m.DeleteAssociationsFunc != nil {
		return m.DeleteAssociationsFunc(email, storyID, associations)
	}
	return nil
}

// DeleteChapters mock implementation.
func (m *MockDAO) DeleteChapters(storyID string, chapters []models.Chapter) error {
	if m.DeleteChaptersFunc != nil {
		return m.DeleteChaptersFunc(storyID, chapters)
	}
	return nil
}

// SoftDeleteStory mock implementation.
func (m *MockDAO) SoftDeleteStory(email, storyID string, isAutomated bool) error {
	if m.SoftDeleteStoryFunc != nil {
		return m.SoftDeleteStoryFunc(email, storyID, isAutomated)
	}
	return nil
}

// DeleteSeries mock implementation.
func (m *MockDAO) DeleteSeries(email string, series models.Series) error {
	if m.DeleteSeriesFunc != nil {
		return m.DeleteSeriesFunc(email, series)
	}
	return nil
}

// WasStoryDeleted mock implementation.
func (m *MockDAO) WasStoryDeleted(email string, storyID string) (bool, error) {
	if m.WasStoryDeletedFunc != nil {
		return m.WasStoryDeletedFunc(email, storyID)
	}
	return false, nil
}

// IsStoryInASeries mock implementation.
func (m *MockDAO) IsStoryInASeries(email string, storyID string) (string, error) {
	if m.IsStoryInASeriesFunc != nil {
		return m.IsStoryInASeriesFunc(email, storyID)
	}
	return "", nil
}

// IsUserSubscribed mock implementation.
func (m *MockDAO) IsUserSubscribed(user models.UserInfo) (*models.UserInfo, error) {
	if m.IsUserSubscribedFunc != nil {
		return m.IsUserSubscribedFunc(user)
	}
	return &user, nil
}

// GetTotalCreatedStories mock implementation.
func (m *MockDAO) GetTotalCreatedStories(email string) (int, error) {
	if m.GetTotalCreatedStoriesFunc != nil {
		return m.GetTotalCreatedStoriesFunc(email)
	}
	return 0, nil
}

// CheckForSuspendedStories mock implementation.
func (m *MockDAO) CheckForSuspendedStories(email string) (bool, error) {
	if m.CheckForSuspendedStoriesFunc != nil {
		return m.CheckForSuspendedStoriesFunc(email)
	}
	return false, nil
}

// CheckTableStatus mock implementation.
func (m *MockDAO) CheckTableStatus(tableName string) (string, error) {
	if m.CheckTableStatusFunc != nil {
		return m.CheckTableStatusFunc(tableName)
	}
	return "ACTIVE", nil
}

// Private methods that need to be stubbed.
//
//nolint:unused // required to satisfy daos.DaoInterface even though api tests don't call them directly.
func (m *MockDAO) ensureBlocksTableFromBackup(_ context.Context, _, _, _ string) error {
	return nil
}

//nolint:unused // required to satisfy daos.DaoInterface.
func (m *MockDAO) kickoffRestoreAsync(_ string) {
	// no-op
}

//nolint:unused // required to satisfy daos.DaoInterface.
func (m *MockDAO) restoreOneStory(_ string, _ models.Story) error {
	return nil
}

//nolint:unused // required to satisfy daos.DaoInterface.
func (m *MockDAO) hardDeleteStory(_, _ string) error {
	return nil
}

//nolint:unused // required to satisfy daos.DaoInterface.
func (m *MockDAO) verifyStripeSubscription(_, _ string) (daos.SubscriptionStatus, error) {
	return daos.SubscriptionStatus{}, nil
}

// CreateShareLink mock implementation.
func (m *MockDAO) CreateShareLink(link models.ShareLink) error {
	if m.CreateShareLinkFunc != nil {
		return m.CreateShareLinkFunc(link)
	}
	return nil
}

// GetShareLink mock implementation.
func (m *MockDAO) GetShareLink(token string) (*models.ShareLink, error) {
	if m.GetShareLinkFunc != nil {
		return m.GetShareLinkFunc(token)
	}
	return &models.ShareLink{Token: token}, nil
}

// GetShareLinksByAuthor mock implementation.
func (m *MockDAO) GetShareLinksByAuthor(email, storyID string) ([]models.ShareLink, error) {
	if m.GetShareLinksByAuthorFunc != nil {
		return m.GetShareLinksByAuthorFunc(email, storyID)
	}
	return []models.ShareLink{}, nil
}

// GetShareLinksByStory mock implementation.
func (m *MockDAO) GetShareLinksByStory(storyID string) ([]models.ShareLink, error) {
	if m.GetShareLinksByStoryFunc != nil {
		return m.GetShareLinksByStoryFunc(storyID)
	}
	return []models.ShareLink{}, nil
}

// RevokeShareLink mock implementation.
func (m *MockDAO) RevokeShareLink(token string) error {
	if m.RevokeShareLinkFunc != nil {
		return m.RevokeShareLinkFunc(token)
	}
	return nil
}

// RestoreShareLink mock implementation.
func (m *MockDAO) RestoreShareLink(token string) error {
	if m.RestoreShareLinkFunc != nil {
		return m.RestoreShareLinkFunc(token)
	}
	return nil
}

// DeleteShareLink mock implementation.
func (m *MockDAO) DeleteShareLink(token string) error {
	if m.DeleteShareLinkFunc != nil {
		return m.DeleteShareLinkFunc(token)
	}
	return nil
}

// CreateComment mock implementation.
func (m *MockDAO) CreateComment(comment models.Comment) error {
	if m.CreateCommentFunc != nil {
		return m.CreateCommentFunc(comment)
	}
	return nil
}

// GetComment mock implementation.
func (m *MockDAO) GetComment(commentID string) (*models.Comment, error) {
	if m.GetCommentFunc != nil {
		return m.GetCommentFunc(commentID)
	}
	return &models.Comment{CommentID: commentID}, nil
}

// GetCommentsByShareToken mock implementation.
func (m *MockDAO) GetCommentsByShareToken(shareToken string) ([]models.Comment, error) {
	if m.GetCommentsByShareTokenFunc != nil {
		return m.GetCommentsByShareTokenFunc(shareToken)
	}
	return []models.Comment{}, nil
}

// GetCommentsByStoryChapter mock implementation.
func (m *MockDAO) GetCommentsByStoryChapter(storyID, chapterID string) ([]models.Comment, error) {
	if m.GetCommentsByStoryChapterFunc != nil {
		return m.GetCommentsByStoryChapterFunc(storyID, chapterID)
	}
	return []models.Comment{}, nil
}

// ResolveComment mock implementation.
func (m *MockDAO) ResolveComment(commentID string) error {
	if m.ResolveCommentFunc != nil {
		return m.ResolveCommentFunc(commentID)
	}
	return nil
}

// DeleteComment mock implementation.
func (m *MockDAO) DeleteComment(commentID string) error {
	if m.DeleteCommentFunc != nil {
		return m.DeleteCommentFunc(commentID)
	}
	return nil
}

// DeleteUser mock implementation.
func (m *MockDAO) DeleteUser(email string) error {
	if m.DeleteUserFunc != nil {
		return m.DeleteUserFunc(email)
	}
	return nil
}

// GetAllUsersWithStories mock implementation.
func (m *MockDAO) GetAllUsersWithStories() ([]models.AdminUserSummary, error) {
	if m.GetAllUsersWithStoriesFunc != nil {
		return m.GetAllUsersWithStoriesFunc()
	}
	return []models.AdminUserSummary{}, nil
}

// GetChaptersByStoryIDs mock implementation.
func (m *MockDAO) GetChaptersByStoryIDs(storyIDs []string) (map[string][]models.Chapter, error) {
	if m.GetChaptersByStoryIDsFunc != nil {
		return m.GetChaptersByStoryIDsFunc(storyIDs)
	}
	return map[string][]models.Chapter{}, nil
}

// Helper function to create a mock DAO with default error behavior.
func NewMockDAOWithError(err error) *MockDAO {
	return &MockDAO{
		GetUserDetailsFunc: func(_ string) (*models.UserInfo, error) {
			return nil, err
		},
		UpdateUserFunc: func(_ models.UserInfo) error {
			return err
		},
		GetStoryByIDFunc: func(_ string, _ string) (*models.Story, error) {
			return nil, err
		},
		EditStoryFunc: func(_ string, _ models.Story) (models.Story, error) {
			return models.Story{}, err
		},
		EditChapterFunc: func(_ string, _ models.Chapter) (models.Chapter, error) {
			return models.Chapter{}, err
		},
		WriteBlocksFunc: func(_ string, _ *models.StoryBlocks) error {
			return err
		},
		WriteAssociationsFunc: func(_, _ string, _ []*models.Association) error {
			return err
		},
	}
}

// Email auth mock implementations

func (m *MockDAO) CreateEmailUser(
	email, firstName, lastName, passwordHash, verificationToken string,
	tokenExpires int64,
) (*models.UserInfo, error) {
	if m.CreateEmailUserFunc != nil {
		return m.CreateEmailUserFunc(email, firstName, lastName, passwordHash, verificationToken, tokenExpires)
	}
	return &models.UserInfo{Email: email}, nil
}

func (m *MockDAO) SetEmailVerified(email string) error {
	if m.SetEmailVerifiedFunc != nil {
		return m.SetEmailVerifiedFunc(email)
	}
	return nil
}

func (m *MockDAO) SetVerificationToken(email, token string, expires int64) error {
	if m.SetVerificationTokenFunc != nil {
		return m.SetVerificationTokenFunc(email, token, expires)
	}
	return nil
}

func (m *MockDAO) SetResetToken(email, token string, expires int64) error {
	if m.SetResetTokenFunc != nil {
		return m.SetResetTokenFunc(email, token, expires)
	}
	return nil
}

func (m *MockDAO) UpdatePassword(email, passwordHash string) error {
	if m.UpdatePasswordFunc != nil {
		return m.UpdatePasswordFunc(email, passwordHash)
	}
	return nil
}

func (m *MockDAO) ClearResetToken(email string) error {
	if m.ClearResetTokenFunc != nil {
		return m.ClearResetTokenFunc(email)
	}
	return nil
}

func (m *MockDAO) LinkOAuthAccount(email, authType string) error {
	if m.LinkOAuthAccountFunc != nil {
		return m.LinkOAuthAccountFunc(email, authType)
	}
	return nil
}

func (m *MockDAO) FindUserByVerificationToken(token string) (*models.UserInfo, error) {
	if m.FindUserByVerificationTokenFunc != nil {
		return m.FindUserByVerificationTokenFunc(token)
	}
	return &models.UserInfo{}, nil
}

func (m *MockDAO) FindUserByResetToken(token string) (*models.UserInfo, error) {
	if m.FindUserByResetTokenFunc != nil {
		return m.FindUserByResetTokenFunc(token)
	}
	return &models.UserInfo{}, nil
}

func (m *MockDAO) RestoreDataForVerifiedUser(_ string) {
	// no-op for tests
}

// Alert mock implementations

func (m *MockDAO) CreateAlert(alert models.Alert) error {
	if m.CreateAlertFunc != nil {
		return m.CreateAlertFunc(alert)
	}
	return nil
}

func (m *MockDAO) GetAlertsForUser(email string) ([]models.Alert, error) {
	if m.GetAlertsForUserFunc != nil {
		return m.GetAlertsForUserFunc(email)
	}
	return []models.Alert{}, nil
}

func (m *MockDAO) GetAlertReadsByUser(email string) ([]models.AlertRead, error) {
	if m.GetAlertReadsByUserFunc != nil {
		return m.GetAlertReadsByUserFunc(email)
	}
	return []models.AlertRead{}, nil
}

func (m *MockDAO) MarkAlertRead(email, alertID string) error {
	if m.MarkAlertReadFunc != nil {
		return m.MarkAlertReadFunc(email, alertID)
	}
	return nil
}

// Common error for testing.
var (
	ErrMockDAO          = errors.New("mock dao error")
	ErrMockNotFound     = errors.New("not found")
	ErrMockUnauthorized = errors.New("unauthorized")
)
