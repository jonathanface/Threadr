package daos

import (
	"RichDocter/models"
)

type DaoInterface interface {
	// GETs
	GetAllStandalone(email string) ([]*models.Story, error)
	GetAllSeriesWithStories(email string) ([]models.Series, error)
	GetChaptersByStoryID(storyID string) ([]models.Chapter, error)
	GetStoryByID(email string, storyID string) (*models.Story, error)
	GetSeriesByID(email string, seriesID string) (*models.Series, error)
	GetStoryCountByUser(email string) (int, error)
	GetStoryParagraphs(email string, storyID string, chapter string, startKey string) (*models.BlocksData, error)
	GetStoryOrSeriesAssociations(email string, storyID string) ([]*models.Association, error)
	GetSeriesVolumes(email string, seriesID string) ([]*models.Story, error)
	GetUserDetails(email string) (*models.UserInfo, error)

	// PUTs
	UpsertUser(email string) error
	ResetBlockOrder(email, storyID string, storyBlocks *models.StoryBlocks) error
	WriteBlocks(email, storyID string, storyBlocks *models.StoryBlocks) error
	WriteAssociations(email, storyOrSeriesID string, associations []*models.Association) error
	UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationName, url string) error
	AddCustomerID(email, customerID *string) error
	AddSubscriptionID(email, subscriptionID *string) error
	EditStory(email string, story models.Story) (models.Story, error)
	EditSeries(email string, series models.Series) (models.Series, error)

	// POSTs
	CreateChapter(storyID string, email string, chapter models.Chapter) error
	CreateStory(email string, story models.Story, newSeriesTitle string) (storyID string, err error)

	// DELETEs
	DeleteStoryParagraphs(email, storyID string, storyBlocks *models.StoryBlocks) error
	DeleteAssociations(email, storyID string, associations []*models.Association) error
	DeleteChapters(email, storyID string, chapters []models.Chapter) error
	SoftDeleteStory(email, storyID, seriesID string) error
	hardDeleteStory(email, storyID, seriesID string) error

	// HELPERS
	WasStoryDeleted(email string, storyID string) (bool, error)
	IsStoryInASeries(email string, storyID string) (string, error)
	IsUserSubscribed(email string) (string, error)
	GetTotalCreatedStoriesAndChapters(email string) (int, int, error)
}
