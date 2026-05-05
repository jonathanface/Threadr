package daos

import (
	"context"
	"os"
	"regexp"
	"strings"

	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Place values are inherent narrative outline section position indices, not magic numbers.
//
//nolint:mnd
func GenerateStoryOutlineSections(typeOf models.OutlineTemplate) []models.OutlineSection {
	var sections []models.OutlineSection
	switch typeOf {
	case models.ThreeAct:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Setup",
			Description: "Introduces the protagonist, world, and central conflict. Generally the first 25% of the book.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Confrontation",
			Description: "Obstacles escalate, character development deepens, and stakes rise. Around 50% of the book should be here.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Resolution",
			Description: "Climax and aftermath of the conflict. 25%.",
		})
	case models.FiveAct:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Exposition",
			Description: "Introduction to the world and protagonist.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Rising Action",
			Description: "Conflict builds, characters react to new challenges.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Climax",
			Description: "The turning point, the moment of greatest tension.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       3,
			Header:      "Falling Action",
			Description: "The consequences of the climax play out.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       4,
			Header:      "Resolution",
			Description: "Loose ends are tied up, and the story concludes.",
		})
	case models.HeroJourney:
		sections = append(sections, models.OutlineSection{
			Place:       0,
			Header:      "Ordinary World",
			Description: "The hero's starting point.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       1,
			Header:      "Call to Adventure",
			Description: "An inciting event disrupts their world.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       2,
			Header:      "Refusal of the Call",
			Description: "The hero hesitates.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       3,
			Header:      "Meeting the Mentor",
			Description: "A guide offers wisdom.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       4,
			Header:      "Crossing the Threshold",
			Description: "The hero commits to the journey.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       5,
			Header:      "Tests, Allies, and Enemies",
			Description: "Encounters shape their path.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       6,
			Header:      "Approach to the Innermost Cave",
			Description: "The hero faces their deepest challenge.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       7,
			Header:      "The Ordeal",
			Description: "A life-changing trial or event.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       8,
			Header:      "The Reward",
			Description: "Victory comes with insight or a gift.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       9,
			Header:      "The Road Back",
			Description: "The hero must return home.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       10,
			Header:      "Resurrection",
			Description: "A final test or transformation.",
		})
		sections = append(sections, models.OutlineSection{
			Place:       11,
			Header:      "Return with the Elixir",
			Description: "The hero brings change back to the world.",
		})
	}
	return sections
}

func GetTableSuffix() string {
	currentMode := models.AppMode(strings.ToLower(os.Getenv("MODE")))
	if currentMode != models.ModeProduction {
		return "_staging"
	}
	return ""
}

var awsPrefixPattern = regexp.MustCompile(`(?i)aws:`)
var disallowedTagChars = regexp.MustCompile(`[^A-Za-z0-9 +\-\=\.\_\:\/@]`)

// CleanDynamoTagString removes all characters that are disallowed in a DynamoDB tag key/value.
func CleanDynamoTagString(input string) string {
	withoutAws := awsPrefixPattern.ReplaceAllString(input, "")

	// Step 2: Remove all disallowed characters.
	cleaned := disallowedTagChars.ReplaceAllString(withoutAws, "")

	// Optionally, trim leading/trailing spaces (if desired)
	return strings.TrimSpace(cleaned)
}

// Check if a story was "suspended" by an account's subscription not renewing.
func (d *DAO) CheckForSuspendedStories(ctx context.Context, email string) (bool, error) {
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return false, err
	}
	if len(out.Items) > 0 {
		return true, nil
	}
	return false, nil
}

func (d *DAO) WasStoryDeleted(ctx context.Context, email string, storyTitle string) (bool, error) {
	exists, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND story_title=:s AND attribute_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyTitle},
		},
	})
	if err != nil {
		return false, err
	}
	if len(exists.Items) > 0 {
		return true, nil
	}
	return false, nil
}

// check if passed story is a member of a series
// return series ID if yes, blank if no.
func (d *DAO) IsStoryInASeries(ctx context.Context, email string, storyID string) (string, error) {
	var (
		err   error
		story *models.Story
	)
	story, err = d.GetStoryByID(ctx, email, storyID)
	if err != nil {
		return "", err
	}
	return story.SeriesID, nil
}

func (d *DAO) GetTotalCreatedStories(ctx context.Context, email string) (storiesCount int, err error) {
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return 0, err
	}
	storiesCount = int(out.Count)
	return storiesCount, err
}
