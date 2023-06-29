package daos

import (
	"RichDocter/models"
)

type DaoInterface interface {
	// GETs
	GetAllStandalone(email string) ([]*models.Story, error)
	GetAllSeriesWithStories(email string) ([]models.Series, error)
	GetStoryByName(email string, storyTitle string) (*models.Story, error)
	GetStoryParagraphs(email string, storyTitle string, chapter string, startKey string) (*models.BlocksData, error)
	GetStoryOrSeriesAssociations(email string, storyTitle string) ([]*models.Association, error)
	GetSeriesVolumes(email string, seriesTitle string) ([]*models.Story, error)

	// PUTs
	UpsertUser(email string) error
	ResetBlockOrder(email, story string, storyBlocks *models.StoryBlocks) error
	WriteBlocks(email, story string, storyBlocks *models.StoryBlocks) error
	WriteAssociations(email, story string, associations []*models.Association) error
	UpdatePortraitEntryInDB(email, story, associationName, url string) error

	// POSTs
	CreateChapter(email, story string, chapter models.Chapter) error
	CreateStory(email string, story models.Story) error

	// DELETEs
	DeleteStoryParagraphs(email, storyTitle string, storyBlocks *models.StoryBlocks) error
	DeleteAssociations(email, storyTitle string, associations []*models.Association) error
	DeleteChapters(email, storyTitle string, chapters []models.Chapter) error
	DeleteStory(email, storyTitle, seriesTitle string) error

	// HELPERS
	WasStoryDeleted(email string, storyTitle string) (bool, error)
	IsStoryInASeries(email string, storyTitle string) (string, error)
}
