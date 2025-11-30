package daos

import (
	"RichDocter/models"
	"context"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type DaoInterface interface {
	// GETs
	GetAllStories(ctx context.Context, email string) ([]*models.Story, error)
	GetAllStandalone(ctx context.Context, email string, adminRequest bool) ([]models.Story, error)
	GetAllSeriesWithStories(ctx context.Context, email string, adminRequest bool) ([]models.Series, error)
	GetChaptersByStoryID(ctx context.Context, storyID string) ([]models.Chapter, error)
	GetChaptersByStoryIDs(ctx context.Context, storyIDs []string) (map[string][]models.Chapter, error)
	GetStoryByID(ctx context.Context, email string, storyID string) (*models.Story, error)
	GetStorySettingsByID(ctx context.Context, email string, storyID string) (*models.StorySettings, error)
	GetSeriesByID(ctx context.Context, email string, seriesID string) (*models.Series, error)
	GetStoryCountByUser(ctx context.Context, email string) (int, error)
	GetChapterParagraphs(ctx context.Context, storyID string, chapterID string, key *map[string]types.AttributeValue) (*models.BlocksData, error)
	GetStoryOrSeriesAssociationThumbnails(ctx context.Context, email, storyID string) ([]*models.SimplifiedAssociation, error)
	GetAssociationDetails(ctx context.Context, email, storyID, associationID string) (*models.Association, error)
	GetSeriesVolumes(ctx context.Context, email string, seriesID string) ([]*models.Story, error)
	GetUserDetails(ctx context.Context, email string) (*models.UserInfo, error)
	GetChapterByID(ctx context.Context, chapterID string) (*models.Chapter, error)
	GetOutlineByStoryID(ctx context.Context, storyID string, chapters []models.Chapter) (*models.OutlineResponse, error)
	GetChapterTableStatus(ctx context.Context, storyID, chapterID string) (bool, error)
	GetSubscription(ctx context.Context, email string) (*models.Subscription, error)
	GetEmailByCustomerId(ctx context.Context, customerID string) (string, error)
	ensureBlocksTableFromBackup(ctx context.Context, backupARN, oldTableName, chapterName string) error
	kickoffRestoreAsync(email string)

	// PUTs
	UpsertUser(ctx context.Context, email string) (*models.UserInfo, error)
	UpdateUser(ctx context.Context, user models.UserInfo) error
	RestoreAutomaticallyDeletedStories(ctx context.Context, email string) (<-chan RestoreStoryEvent, error)
	restoreOneStory(ctx context.Context, email string, story models.Story) error
	ResetBlockOrder(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) error
	WriteBlocks(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) error
	WriteAssociations(ctx context.Context, email, storyOrSeriesID string, associations []*models.Association) error
	UpdateAssociationPortraitEntryInDB(ctx context.Context, email, storyOrSeriesID, associationID, url string) error
	AddCustomerID(ctx context.Context, email, customerID *string) error
	AddStripeData(ctx context.Context, email, subscriptionID, customerID *string) error
	EditStory(ctx context.Context, email string, story models.Story) (models.Story, error)
	UpdateStorySettings(ctx context.Context, email, storyID string, settings models.StorySettings) error
	EditSeries(ctx context.Context, email string, series models.Series) (models.Series, error)
	EditChapter(ctx context.Context, storyID string, chapter models.Chapter) (models.Chapter, error)
	RemoveStoryFromSeries(ctx context.Context, email, storyID string, series models.Series) (models.Series, error)
	UpdateOutline(ctx context.Context, outline models.OutlineRequest) (*models.OutlineResponse, error)
	UpdateSubscription(ctx context.Context, subscription models.Subscription) error

	// POSTs
	CreateChapter(ctx context.Context, storyID string, chapter models.Chapter, email string) (models.Chapter, error)
	CreateStory(ctx context.Context, email string, story models.Story, newSeriesTitle string) (storyID string, err error)
	CreateUser(ctx context.Context, email string) (*models.UserInfo, error)
	CreateOutline(ctx context.Context, outline models.OutlineRequest) (*models.OutlineRequest, error)

	// DELETEs
	DeleteChapterParagraphs(ctx context.Context, storyID string, storyBlocks *models.StoryBlocks) error
	DeleteAssociations(ctx context.Context, email, storyID string, associations []*models.Association) error
	DeleteChapters(ctx context.Context, storyID string, chapters []models.Chapter) error
	SoftDeleteStory(ctx context.Context, email, storyID string, isAutomated bool) error
	hardDeleteStory(ctx context.Context, email, storyID string) error
	DeleteSeries(ctx context.Context, email string, series models.Series) error

	// HELPERS
	WasStoryDeleted(ctx context.Context, email string, storyID string) (bool, error)
	IsStoryInASeries(ctx context.Context, email string, storyID string) (string, error)
	IsUserSubscribed(ctx context.Context, user models.UserInfo) (*models.UserInfo, error)
	verifyStripeSubscription(subID, customerID string) (SubscriptionStatus, error)
	GetTotalCreatedStories(ctx context.Context, email string) (int, error)
	CheckForSuspendedStories(ctx context.Context, email string) (bool, error)
	CheckTableStatus(ctx context.Context, tableName string) (string, error)
	awsWriteTransaction(ctx context.Context, writeItemsInput *dynamodb.TransactWriteItemsInput) (awsError models.AwsError, err error)
}
