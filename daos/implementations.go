package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"os"
	"path"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

const (
	S3_STORY_BASE_URL           = "https://richdocter-story-portraits.s3.amazonaws.com"
	S3_SERIES_BASE_URL          = "https://richdocter-series-portraits.s3.amazonaws.com"
	S3_PORTRAIT_BASE_URL        = "https://richdocterportraits.s3.amazonaws.com/"
	S3_LOCATION_BASE_URL        = "https://richdocterlocations.s3.amazonaws.com/"
	S3_EVENT_BASE_URL           = "https://richdocterevents.s3.amazonaws.com/"
	MAX_DEFAULT_PORTRAIT_IMAGES = 50
	MAX_DEFAULT_LOCATION_IMAGES = 20
	MAX_DEFAULT_EVENT_IMAGES    = 20
	DYNAMO_WRITE_BATCH_SIZE     = 50
	DEFAULT_SERIES_IMAGE_URL    = "/img/icons/story_series_icon.jpg"
)

type DAO struct {
	dynamoClient   *dynamodb.Client
	s3Client       *s3.Client
	maxRetries     int
	capacity       int
	writeBatchSize int
}

func NewDAO() *DAO {
	var (
		awsCfg                     aws.Config
		err                        error
		maxAWSRetries              int
		blockTableMinWriteCapacity int
	)
	if os.Getenv("APP_MODE") != "PRODUCTION" {
		if err = godotenv.Load(); err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		panic(err)
	}
	if maxAWSRetries, err = strconv.Atoi(os.Getenv("AWS_MAX_RETRIES")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	if blockTableMinWriteCapacity, err = strconv.Atoi(os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY")); err != nil {
		panic(fmt.Sprintf("Error parsing env data: %s", err.Error()))
	}
	awsCfg.RetryMaxAttempts = maxAWSRetries
	return &DAO{
		dynamoClient:   dynamodb.NewFromConfig(awsCfg),
		s3Client:       s3.NewFromConfig(awsCfg),
		maxRetries:     maxAWSRetries,
		capacity:       blockTableMinWriteCapacity,
		writeBatchSize: DYNAMO_WRITE_BATCH_SIZE,
	}
}

func (d *DAO) GetAllStories(email string) (stories []*models.Story, err error) {
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return nil, err
	}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return nil, err
	}

	// Sort stories by the created_at timestamp

	sort.Slice(stories, func(i, j int) bool {
		return stories[i].CreatedAt < stories[j].CreatedAt
	})

	for i := 0; i < len(stories); i++ {
		stories[i].Chapters, err = d.GetChaptersByStoryID(stories[i].ID)
		if err != nil {
			return nil, err
		}
	}
	return stories, nil
}

func (d *DAO) GetAllStandalone(email string, adminRequest bool) (stories map[string][]models.Story, err error) {
	input := &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(series_id) AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	if adminRequest {
		input = &dynamodb.ScanInput{
			TableName:        aws.String("stories"),
			FilterExpression: aws.String("attribute_not_exists(series_id) AND attribute_not_exists(deleted_at)"),
		}
	}
	out, err := d.dynamoClient.Scan(context.TODO(), input)
	if err != nil {
		return nil, err
	}

	storiesMap := make(map[string][]models.Story)
	for _, item := range out.Items {
		if authorAttr, ok := item["author"]; ok {
			if authorStrAttr, ok := authorAttr.(*types.AttributeValueMemberS); ok {
				author := authorStrAttr.Value

				// Create a sub-map for the item's attributes
				itemMap := make(map[string]types.AttributeValue)
				for key, attr := range item {
					itemMap[key] = attr
				}

				// Map the author to the item's attributes
				var story models.Story
				if err = attributevalue.UnmarshalMap(itemMap, &story); err != nil {
					return nil, err
				}

				storiesMap[author] = append(storiesMap[author], story)
			}
		}
	}

	for author, stories := range storiesMap {
		for i, story := range stories {
			story.Chapters, err = d.GetChaptersByStoryID(story.ID)
			if err != nil {
				return nil, err
			}
			storiesMap[author][i] = story
		}
	}
	return storiesMap, nil
}

func (d *DAO) GetChaptersByStoryID(storyID string) (chapters []models.Chapter, err error) {
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("story_id=:sid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		return nil, err
	}

	chapters = []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &chapters); err != nil {
		return nil, err
	}
	sort.Slice(chapters, func(i, j int) bool {
		return chapters[i].Place < chapters[j].Place
	})

	return chapters, nil
}

func (d *DAO) CreateUser(email string) error {
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	attributes := map[string]types.AttributeValue{
		"email":      &types.AttributeValueMemberS{Value: email},
		"admin":      &types.AttributeValueMemberBOOL{Value: false},
		"subscriber": &types.AttributeValueMemberBOOL{Value: false},
		"created_at": &types.AttributeValueMemberN{Value: now},
	}
	twi := types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("users"),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(email)"),
		},
	}

	twii.TransactItems = append(twii.TransactItems, twi)
	err, awsErr := d.awsWriteTransaction(twii)
	if err != nil {
		return err
	}
	if !awsErr.IsNil() {
		return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}
	return nil
}

func (d *DAO) GetUserDetails(email string) (user *models.UserInfo, err error) {
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("users"),
		FilterExpression: aws.String("email=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return user, err
	}

	userFromMap := []models.UserInfo{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &userFromMap); err != nil {
		return user, err
	}
	if len(userFromMap) == 0 {
		return user, fmt.Errorf("no user found")
	}
	return &userFromMap[0], nil
}

func (d *DAO) GetStoryByID(email, storyID string) (story *models.Story, err error) {
	storyID, err = url.QueryUnescape(storyID)
	if err != nil {
		return story, err
	}
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyID},
		},
	}
	userDetails, err := d.GetUserDetails(email)
	if err != nil {
		return story, err
	}
	if userDetails.Admin {
		scanInput = &dynamodb.ScanInput{
			TableName:        aws.String("stories"),
			FilterExpression: aws.String("story_id=:s AND attribute_not_exists(deleted_at)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":s": &types.AttributeValueMemberS{Value: storyID},
			},
		}
	}
	out, err := d.dynamoClient.Scan(context.TODO(), scanInput)
	if err != nil {
		return story, err
	}

	storyFromMap := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &storyFromMap); err != nil {
		return story, err
	}
	if len(storyFromMap) == 0 {
		return story, fmt.Errorf("no story found")
	}
	storyFromMap[0].Chapters, err = d.GetChaptersByStoryID(storyID)
	if err != nil {
		return
	}
	return &storyFromMap[0], nil
}

func (d *DAO) GetChapterByID(chapterID string) (chapter *models.Chapter, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("chapter_id=:cid AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cid": &types.AttributeValueMemberS{Value: chapterID},
		},
	}
	out, err := d.dynamoClient.Scan(context.TODO(), scanInput)
	if err != nil {
		return nil, err
	}

	chapterFromMap := []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &chapterFromMap); err != nil {
		return nil, err
	}
	if len(chapterFromMap) == 0 {
		return nil, fmt.Errorf("no chapter found")
	}
	return &chapterFromMap[0], nil
}

func (d *DAO) GetSeriesByID(email, seriesID string) (series *models.Series, err error) {
	seriesID, err = url.QueryUnescape(seriesID)
	if err != nil {
		return series, err
	}
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("series"),
		FilterExpression: aws.String("author=:eml AND series_id=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: seriesID},
		},
	})
	if err != nil {
		return series, err
	}

	seriesFromMap := []models.Series{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &seriesFromMap); err != nil {
		return series, err
	}
	if len(seriesFromMap) == 0 {
		return series, fmt.Errorf("no series found")
	}
	seriesFromMap[0].Stories, err = d.GetSeriesVolumes(email, seriesID)
	if err != nil {
		return series, err
	}
	for _, story := range seriesFromMap[0].Stories {
		story.Chapters, err = d.GetChaptersByStoryID(story.ID)
		if err != nil {
			return series, err
		}
	}

	return &seriesFromMap[0], nil
}

func (d *DAO) GetStoryParagraphs(storyID, chapterID string, startKey *map[string]types.AttributeValue) (*models.BlocksData, error) {
	var blocks models.BlocksData
	tableName := storyID + "_" + chapterID + "_blocks"
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("story_id-place-index"),
		KeyConditionExpression: aws.String("#place>:p AND story_id=:sid"),
		ExpressionAttributeNames: map[string]string{
			"#place": "place",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":sid": &types.AttributeValueMemberS{
				Value: storyID,
			},
		},
	}

	if startKey != nil {
		queryInput.ExclusiveStartKey = *startKey
	}

	var items []map[string]types.AttributeValue
	paginator := dynamodb.NewQueryPaginator(d.dynamoClient, queryInput)

	var lastKey map[string]types.AttributeValue
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			if opErr, ok := err.(*smithy.OperationError); ok {
				var notFoundErr *types.ResourceNotFoundException
				if errors.As(opErr.Unwrap(), &notFoundErr) {
					return &blocks, err
				}
			}
			return &blocks, err
		}
		if page.LastEvaluatedKey != nil {
			lastKey = page.LastEvaluatedKey
		}
		items = append(items, page.Items...)
	}
	if len(items) == 0 {
		return nil, nil
	}
	blocks.Items = items
	blocks.LastEvaluated = lastKey
	return &blocks, nil
}

func (d *DAO) GetStoryOrSeriesAssociations(email, storyID string, needDetails bool) ([]*models.Association, error) {
	var (
		associations []*models.Association
		err          error
	)
	outStory, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_id=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		return associations, err
	}
	storyObj := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &storyObj); err != nil {
		return associations, err
	}
	var storyOrSeries string
	if storyOrSeries, err = d.IsStoryInASeries(email, storyID); err != nil {
		return associations, err
	}
	if storyOrSeries == "" {
		storyOrSeries = storyID
	}
	filterString := "author=:eml AND story_or_series_id=:s"
	expressionValues := map[string]types.AttributeValue{
		":eml": &types.AttributeValueMemberS{Value: email},
		":s":   &types.AttributeValueMemberS{Value: storyOrSeries},
	}

	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:                 aws.String("associations"),
		FilterExpression:          aws.String(filterString),
		ExpressionAttributeValues: expressionValues,
	})
	if err != nil {
		return associations, err
	}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &associations); err != nil {
		return associations, err
	}

	if needDetails {
		for i, v := range associations {
			outDetails, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
				TableName:        aws.String("association_details"),
				FilterExpression: aws.String("association_id=:aid"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":aid": &types.AttributeValueMemberS{Value: v.ID},
				},
			})
			if err != nil {
				return associations, err
			}
			deets := []models.AssociationDetails{}
			if err = attributevalue.UnmarshalListOfMaps(outDetails.Items, &deets); err != nil {
				return associations, err
			}
			if len(deets) > 0 {
				associations[i].Details = deets[0]
			}
		}
	}

	return associations, nil
}

func (d *DAO) GetAllSeriesWithStories(email string, adminRequest bool) (series map[string][]models.Series, err error) {
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String("series"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	if adminRequest {
		scanInput = &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
		}
	}
	scanOutput, err := d.dynamoClient.Scan(context.TODO(), scanInput)
	if err != nil {
		return series, err
	}

	seriesMap := make(map[string][]models.Series)
	for _, item := range scanOutput.Items {
		if authorAttr, ok := item["author"]; ok {
			if authorStrAttr, ok := authorAttr.(*types.AttributeValueMemberS); ok {
				author := authorStrAttr.Value

				// Create a sub-map for the item's attributes
				itemMap := make(map[string]types.AttributeValue)
				for key, attr := range item {
					itemMap[key] = attr
				}

				// Map the author to the item's attributes
				var series models.Series
				if err = attributevalue.UnmarshalMap(itemMap, &series); err != nil {
					return nil, err
				}
				series.Stories, err = d.GetSeriesVolumes(email, series.ID)
				if err != nil {
					return nil, err
				}
				seriesMap[author] = append(seriesMap[author], series)
			}
		}
	}

	for author, seri := range seriesMap {
		for i, series := range seri {
			for s, story := range series.Stories {
				story.Chapters, err = d.GetChaptersByStoryID(story.ID)
				if err != nil {
					return nil, err
				}
				seriesMap[author][i].Stories[s] = story
			}
		}
	}
	return seriesMap, err
}

func (d *DAO) GetSeriesVolumes(email, seriesID string) (volumes []*models.Story, err error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("stories"),
		IndexName:              aws.String("series_id-place-index"),
		KeyConditionExpression: aws.String("series_id = :sid AND place > :p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":sid": &types.AttributeValueMemberS{
				Value: seriesID,
			},
		},
		FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
	}

	var seriesOutput *dynamodb.QueryOutput
	if seriesOutput, err = d.dynamoClient.Query(context.TODO(), queryInput); err != nil {
		return volumes, err
	}

	stories := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(seriesOutput.Items, &stories); err != nil {
		return volumes, err
	}

	for idx, story := range stories {
		chapters, err := d.GetChaptersByStoryID(story.ID)
		if err != nil {
			return nil, err
		}
		stories[idx].Chapters = chapters
		volumes = append(volumes, &stories[idx])
	}
	return volumes, nil
}

func (d *DAO) UpsertUser(email string) (err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users"),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		ReturnValues:     types.ReturnValueUpdatedNew,
		UpdateExpression: aws.String("set last_accessed=:t, created_at=if_not_exists(created_at, :t)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
		},
	}
	var out *dynamodb.UpdateItemOutput
	if out, err = d.dynamoClient.UpdateItem(context.TODO(), input); err != nil {
		return err
	}
	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		fmt.Println("new account created")
	}
	return
}

func (d *DAO) UpdateUser(user models.UserInfo) (err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users"),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: user.Email},
		},
		ReturnValues:     types.ReturnValueUpdatedNew,
		UpdateExpression: aws.String("set last_accessed=:t, subscription_id=:sid, expired=:e, renewing=:r"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t":   &types.AttributeValueMemberN{Value: now},
			":sid": &types.AttributeValueMemberS{Value: user.SubscriptionID},
			":r":   &types.AttributeValueMemberBOOL{Value: user.Renewing},
			":e":   &types.AttributeValueMemberBOOL{Value: user.Expired},
		},
	}
	var out *dynamodb.UpdateItemOutput
	if out, err = d.dynamoClient.UpdateItem(context.TODO(), input); err != nil {
		return err
	}
	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		fmt.Println("accountUpdated")
	}
	return
}

func (d *DAO) ResetBlockOrder(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks"
	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}
		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) WriteBlocks(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks"

	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String(tableName),
				Key:              key,
				UpdateExpression: aws.String("set chunk=:c, story_id=:s, place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":c": &types.AttributeValueMemberS{Value: string(item.Chunk)},
					":s": &types.AttributeValueMemberS{Value: storyID},
					":p": &types.AttributeValueMemberN{Value: item.Place},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}
		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) WriteAssociations(email, storyOrSeriesID string, associations []*models.Association) (err error) {
	batches := make([][]*models.Association, 0, (len(associations)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(associations); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(associations) {
			end = len(associations)
		}
		batches = append(batches, associations[i:end])
	}

	now := strconv.FormatInt(time.Now().Unix(), 10)
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		writeItemsDetailsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			imgFile := item.Portrait
			if imgFile == "" {
				switch item.Type {
				case "character":
					imageFileName := rand.Intn(MAX_DEFAULT_PORTRAIT_IMAGES-1) + 1
					imgFile = S3_PORTRAIT_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				case "place":
					imageFileName := rand.Intn(MAX_DEFAULT_LOCATION_IMAGES-1) + 1
					imgFile = S3_LOCATION_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				case "event":
					imageFileName := rand.Intn(MAX_DEFAULT_EVENT_IMAGES-1) + 1
					imgFile = S3_EVENT_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
				}
			}
			shortDescription := item.ShortDescription
			extendedDescription := item.Details.ExtendedDescription
			associations[i].Portrait = imgFile
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: item.ID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String("associations"),
				Key:              key,
				UpdateExpression: aws.String("set association_name=:nm, author=:eml, created_at=if_not_exists(created_at,:t), last_updated=:t, association_type=:at, portrait=:p, short_description=:sd"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":nm":  &types.AttributeValueMemberS{Value: item.Name},
					":eml": &types.AttributeValueMemberS{Value: email},
					":t":   &types.AttributeValueMemberN{Value: now},
					":at":  &types.AttributeValueMemberS{Value: item.Type},
					":p":   &types.AttributeValueMemberS{Value: imgFile},
					":sd":  &types.AttributeValueMemberS{Value: shortDescription},
				},
			}

			updateDetailsInput := &types.Update{
				TableName:        aws.String("association_details"),
				Key:              key,
				UpdateExpression: aws.String("set author=:eml, case_sensitive=:c, extended_description=:ed, aliases=:al"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
					":c":   &types.AttributeValueMemberBOOL{Value: item.Details.CaseSensitive},
					":ed":  &types.AttributeValueMemberS{Value: extendedDescription},
					":al":  &types.AttributeValueMemberS{Value: item.Details.Aliases},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Update: updateInput,
			}
			writeDetailsItem := types.TransactWriteItem{
				Update: updateDetailsInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
			writeItemsDetailsInput.TransactItems[i] = writeDetailsItem
		}
		var awsErr models.AwsError
		err, awsErr = d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}

		err, awsErr := d.awsWriteTransaction(writeItemsDetailsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, url string) (err error) {
	key := map[string]types.AttributeValue{
		"association_id":     &types.AttributeValueMemberS{Value: associationID},
		"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	updateInput := &dynamodb.UpdateItemInput{
		TableName:           aws.String("associations"),
		Key:                 key,
		UpdateExpression:    aws.String("set portrait=:p, last_updated=:t"),
		ConditionExpression: aws.String("author=:eml"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p":   &types.AttributeValueMemberS{Value: url},
			":eml": &types.AttributeValueMemberS{Value: email},
			":t":   &types.AttributeValueMemberN{Value: now},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err = d.dynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		return err
	}
	return nil
}

func (d *DAO) CreateChapter(storyID string, chapter models.Chapter) (newChapter models.Chapter, err error) {
	newChapter = chapter
	var chapTwi types.TransactWriteItem
	if chapTwi, err = d.generateStoryChapterTransaction(storyID, chapter.ID, chapter.Title, chapter.Place); err != nil {
		return
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	twii.TransactItems = append(twii.TransactItems, chapTwi)
	err, awsErr := d.awsWriteTransaction(twii)
	if err != nil {
		return models.Chapter{}, err
	}
	if !awsErr.IsNil() {
		return models.Chapter{}, fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	tableName := storyID + "_" + chapter.ID + "_blocks"
	if err = d.createBlockTable(tableName); err != nil {
		return models.Chapter{}, err
	}
	return newChapter, nil
}

// func (d *DAO) waitForTableToGoActive(tableName string, maxRetries int, delayBetweenRetries time.Duration) error {
// 	for i := 0; i < maxRetries; i++ {
// 		resp, err := d.dynamoClient.DescribeTable(context.TODO(), &dynamodb.DescribeTableInput{
// 			TableName: &tableName,
// 		})
// 		if err != nil {
// 			return err
// 		}

// 		if resp.Table.TableStatus == types.TableStatusActive {
// 			return nil
// 		}
// 		time.Sleep(delayBetweenRetries)
// 	}
// 	return fmt.Errorf("table %s did not become active after %d retries", tableName, maxRetries)
// }

// func (d *DAO) copyTableContents(email, srcTableName, destTableName string) error {
// 	describeInput := &dynamodb.DescribeTableInput{
// 		TableName: &destTableName,
// 	}
// 	describeResp, err := d.dynamoClient.DescribeTable(context.TODO(), describeInput)
// 	var resourceNotFoundErr *types.ResourceNotFoundException
// 	if err != nil {
// 		return err
// 	}
// 	if err == nil {
// 		// The destination table exists, check its status.
// 		if describeResp.Table.TableStatus != types.TableStatusActive {
// 			// Table exists but is not active, you may need to wait.
// 			err = d.waitForTableToGoActive(destTableName, 20, time.Second*1)
// 			if err != nil {
// 				return fmt.Errorf("destination table %s is not ready: %v", destTableName, err)
// 			}
// 		}
// 	} else if !errors.As(err, &resourceNotFoundErr) {
// 		// Other error other than not found, fail the operation.
// 		return fmt.Errorf("error checking status of destination table %s: %v", destTableName, err)
// 	}

// 	paginator := dynamodb.NewScanPaginator(d.dynamoClient, &dynamodb.ScanInput{
// 		TableName: &srcTableName,
// 	})
// 	for paginator.HasMorePages() {
// 		page, err := paginator.NextPage(context.TODO())
// 		if err != nil {
// 			return err
// 		}

// 		for _, item := range page.Items {
// 			_, err := d.dynamoClient.PutItem(context.TODO(), &dynamodb.PutItemInput{
// 				TableName: &destTableName,
// 				Item:      item,
// 			})

// 			if err != nil {
// 				return err
// 			}
// 		}
// 	}
// 	return nil
// }

func (d *DAO) EditSeries(email string, series models.Series) (updatedSeries models.Series, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"series_id":   &types.AttributeValueMemberS{Value: series.ID},
		"title":       &types.AttributeValueMemberS{Value: series.Title},
		"author":      &types.AttributeValueMemberS{Value: email},
		"description": &types.AttributeValueMemberS{Value: series.Description},
		"image_url":   &types.AttributeValueMemberS{Value: series.ImageURL},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	updatedSeries = series

	for _, story := range series.Stories {
		// all we can change is the placement of stories
		_, err := d.GetStoryByID(email, story.ID)
		if err != nil {
			return updatedSeries, err
		}
		key := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              key,
			UpdateExpression: aws.String("set place = :p"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":p": &types.AttributeValueMemberN{Value: strconv.Itoa(story.Place)},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return updatedSeries, err
		}
	}

	seriesUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("series"),
		Item:      item,
	}
	_, err = d.dynamoClient.PutItem(context.Background(), seriesUpdateInput)
	if err != nil {
		return updatedSeries, err
	}
	return updatedSeries, nil
}

func (d *DAO) RemoveStoryFromSeries(email, storyID string, series models.Series) (updatedSeries models.Series, err error) {

	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories"),
		Key:              storyKey,
		UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err = d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
	if err != nil {
		return updatedSeries, err
	}
	updatedSeries = series
	var newStories []*models.Story
	for _, seriesStory := range series.Stories {
		if seriesStory.ID != storyID {
			newStories = append(newStories, seriesStory)
		}
	}
	updatedSeries.Stories = newStories
	return
}

func (d *DAO) EditChapter(storyID string, chapter models.Chapter) (updatedChapter models.Chapter, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: storyID},
		"chapter_id":  &types.AttributeValueMemberS{Value: chapter.ID},
		"chapter_num": &types.AttributeValueMemberN{Value: strconv.Itoa(chapter.Place)},
		"title":       &types.AttributeValueMemberS{Value: chapter.Title},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	updatedChapter = chapter
	chapterUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("chapters"),
		Item:      item,
	}
	_, err = d.dynamoClient.PutItem(context.Background(), chapterUpdateInput)
	if err != nil {
		return updatedChapter, err
	}
	return updatedChapter, nil
}

func (d *DAO) EditStory(email string, story models.Story) (updatedStory models.Story, err error) {
	modifiedAtStr := strconv.FormatInt(time.Now().Unix(), 10)
	item := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: story.ID},
		"title":       &types.AttributeValueMemberS{Value: story.Title},
		"author":      &types.AttributeValueMemberS{Value: email},
		"description": &types.AttributeValueMemberS{Value: story.Description},
		"image_url":   &types.AttributeValueMemberS{Value: story.ImageURL},
		"modified_at": &types.AttributeValueMemberN{Value: modifiedAtStr},
	}
	if story.SeriesID != "" {
		intPlace := strconv.Itoa(story.Place)
		item["series_id"] = &types.AttributeValueMemberS{Value: story.SeriesID}
		item["place"] = &types.AttributeValueMemberN{Value: intPlace}
	}
	updatedStory = story
	storedStory, err := d.GetStoryByID(email, story.ID)
	if err != nil {
		return updatedStory, err
	}
	if story.SeriesID != storedStory.SeriesID {
		// a change in series
		if story.SeriesID != "" {
			// check if this is a new or existing series
			series, err := d.GetSeriesByID(email, story.SeriesID)
			var seriesID string
			if err != nil {
				// TODO this is hack
				if err.Error() != "no series found" {
					return updatedStory, err
				} else {
					updatedStory.Place = 1
					seriesID = uuid.New().String()
					seriesItem := map[string]types.AttributeValue{
						"series_id": &types.AttributeValueMemberS{Value: seriesID},
						"title":     &types.AttributeValueMemberS{Value: story.SeriesID},
						"author":    &types.AttributeValueMemberS{Value: email},
					}
					seriesUpdateInput := &dynamodb.PutItemInput{
						TableName: aws.String("series"),
						Item:      seriesItem,
					}
					_, err = d.dynamoClient.PutItem(context.Background(), seriesUpdateInput)
					if err != nil {
						return updatedStory, err
					}
				}
			} else {
				seriesID = series.ID

				if len(series.Stories) > 1 {
					sort.Slice(series.Stories, func(i, j int) bool {
						return series.Stories[i].Place > series.Stories[j].Place
					})
				} else if len(series.Stories) == 1 {
					updatedStory.Place = series.Stories[0].Place + 1
				}
			}
			item["series_id"] = &types.AttributeValueMemberS{Value: seriesID}
			item["place"] = &types.AttributeValueMemberN{Value: strconv.Itoa(updatedStory.Place)}
			updatedStory.SeriesID = seriesID
		} else {
			// story was removed from series OR new series
			_, err := d.GetSeriesByID(email, story.SeriesID)
			if err != nil {
				// TODO this is hack
				if err.Error() != "no series found" {
					return updatedStory, err
				} else if story.SeriesID != "" {
					// new series
					updatedStory.Place = 1
					seriesID := uuid.New().String()
					seriesItem := map[string]types.AttributeValue{
						"series_id": &types.AttributeValueMemberS{Value: seriesID},
						"title":     &types.AttributeValueMemberS{Value: story.SeriesID},
						"author":    &types.AttributeValueMemberS{Value: email},
					}
					seriesUpdateInput := &dynamodb.PutItemInput{
						TableName: aws.String("series"),
						Item:      seriesItem,
					}
					_, err = d.dynamoClient.PutItem(context.Background(), seriesUpdateInput)
					if err != nil {
						return updatedStory, err
					}
				} else {
					// remove from series
					storedSeries, err := d.GetSeriesByID(email, storedStory.SeriesID)
					if err != nil {
						return updatedStory, err
					}
					var newStories []*models.Story
					for _, seriesStory := range storedSeries.Stories {
						if seriesStory.ID != updatedStory.ID {
							newStories = append(newStories, seriesStory)
						}
					}
					storedSeries.Stories = newStories
					_, err = d.EditSeries(email, *storedSeries)
					if err != nil {
						return updatedStory, err
					}
				}
				updatedStory.Place = 0
			}
		}
	}

	storyUpdateInput := &dynamodb.PutItemInput{
		TableName: aws.String("stories"),
		Item:      item,
	}
	_, err = d.dynamoClient.PutItem(context.Background(), storyUpdateInput)
	if err != nil {
		return updatedStory, err
	}
	return updatedStory, nil
}

func (d *DAO) CreateStory(email string, story models.Story, newSeriesTitle string) (storyID string, err error) {
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	attributes := map[string]types.AttributeValue{
		"story_id":    &types.AttributeValueMemberS{Value: story.ID},
		"author":      &types.AttributeValueMemberS{Value: email},
		"title":       &types.AttributeValueMemberS{Value: story.Title},
		"description": &types.AttributeValueMemberS{Value: story.Description},
		"created_at":  &types.AttributeValueMemberN{Value: now},
		"image_url":   &types.AttributeValueMemberS{Value: story.ImageURL},
	}

	fmt.Println("series", story.SeriesID)

	if story.SeriesID != "" {
		intPlace := strconv.Itoa(story.Place)
		attributes["series_id"] = &types.AttributeValueMemberS{Value: story.SeriesID}
		attributes["place"] = &types.AttributeValueMemberN{Value: intPlace}
	}
	twi := types.TransactWriteItem{
		Put: &types.Put{
			TableName:           aws.String("stories"),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(story_id)"),
		},
	}

	twii.TransactItems = append(twii.TransactItems, twi)
	err, awsErr := d.awsWriteTransaction(twii)
	if err != nil {
		return "", err
	}
	if !awsErr.IsNil() {
		return "", fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	if story.SeriesID != "" {
		twii = &dynamodb.TransactWriteItemsInput{}
		params := &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("series_id=:sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: story.SeriesID},
			},
			Select: types.SelectCount,
		}

		// Execute the scan operation and get the count
		var resp *dynamodb.ScanOutput
		if resp, err = d.dynamoClient.Scan(context.TODO(), params); err != nil {
			return
		}

		if resp.Count == 0 {
			attributes := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: story.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
				"title":     &types.AttributeValueMemberS{Value: newSeriesTitle},
				"image_url": &types.AttributeValueMemberS{Value: DEFAULT_SERIES_IMAGE_URL},
			}
			seriesTwi := types.TransactWriteItem{
				Put: &types.Put{
					TableName:           aws.String("series"),
					Item:                attributes,
					ConditionExpression: aws.String("attribute_not_exists(series_id)"),
				},
			}
			twii.TransactItems = append(twii.TransactItems, seriesTwi)
			resp.Count++
		}

		updateStoryTwi := types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String("stories"),
				Key: map[string]types.AttributeValue{
					"story_id": &types.AttributeValueMemberS{Value: story.ID},
					"author":   &types.AttributeValueMemberS{Value: email},
				},
				UpdateExpression: aws.String("set place=:p, series_id=:sid"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":p":   &types.AttributeValueMemberN{Value: strconv.Itoa(int(resp.Count))},
					":sid": &types.AttributeValueMemberS{Value: story.SeriesID},
				},
			},
		}
		twii.TransactItems = append(twii.TransactItems, updateStoryTwi)
		err, awsErr = d.awsWriteTransaction(twii)
		if err != nil {
			return "", err
		}
		if !awsErr.IsNil() {
			return "", fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return story.ID, nil
}

func (d *DAO) DeleteStoryParagraphs(storyID string, storyBlocks *models.StoryBlocks) (err error) {
	tableName := storyID + "_" + storyBlocks.ChapterID + "_blocks"

	batches := make([][]models.StoryBlock, 0, (len(storyBlocks.Blocks)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(storyBlocks.Blocks); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(storyBlocks.Blocks) {
			end = len(storyBlocks.Blocks)
		}
		batches = append(batches, storyBlocks.Blocks[i:end])
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"key_id": &types.AttributeValueMemberS{Value: item.KeyID},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String(tableName),
			}
			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
		}

		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) DeleteAssociations(email, storyID string, associations []*models.Association) (err error) {
	batches := make([][]*models.Association, 0, (len(associations)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(associations); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(associations) {
			end = len(associations)
		}
		batches = append(batches, associations[i:end])
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = d.IsStoryInASeries(email, storyID); err != nil {
		return err
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}

	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		writeItemsDetailsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: item.ID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String("associations"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
					":t":   &types.AttributeValueMemberS{Value: item.Type},
				},
			}
			deleteDetailsInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("association_details"),
				ConditionExpression: aws.String("author=:eml"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
				},
			}
			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}
			writeDetailsItem := types.TransactWriteItem{
				Delete: deleteDetailsInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem
			writeItemsDetailsInput.TransactItems[i] = writeDetailsItem
		}
		var awsErr models.AwsError
		err, awsErr = d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}

		err, awsErr := d.awsWriteTransaction(writeItemsDetailsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) DeleteChapters(storyID string, chapters []models.Chapter) (err error) {
	batches := make([][]models.Chapter, 0, (len(chapters)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(chapters); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(chapters) {
			end = len(chapters)
		}
		batches = append(batches, chapters[i:end])
	}
	// Loop through the items and create the transaction write items.
	for _, batch := range batches {
		writeItemsInput := &dynamodb.TransactWriteItemsInput{
			ClientRequestToken: nil,
			TransactItems:      make([]types.TransactWriteItem, len(batch)),
		}
		for i, item := range batch {
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: item.ID},
				"story_id":   &types.AttributeValueMemberS{Value: storyID},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:       key,
				TableName: aws.String("chapters"),
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem

			tableName := storyID + "_" + item.ID + "_blocks"

			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(tableName),
			}

			// Delete the table
			if _, err = d.dynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
				return
			}
		}
		err, awsErr := d.awsWriteTransaction(writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return
}

func (d *DAO) RestoreAutomaticallyDeletedStories(email string) error {
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":a":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return err
	}

	var stories []models.Story
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &stories); err != nil {
		return err
	}
	for _, story := range stories {
		chapterScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("chapters"),
			FilterExpression: aws.String("attribute_exists(deleted_at) AND story_id = :sid AND attribute_exists(bup_arn)"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":sid": &types.AttributeValueMemberS{Value: story.ID},
			},
			Select: types.SelectAllAttributes,
		}
		chapterOut, err := d.dynamoClient.Scan(context.TODO(), chapterScanInput)
		if err != nil {
			return err
		}
		var chapters []models.Chapter
		if err = attributevalue.UnmarshalListOfMaps(chapterOut.Items, &chapters); err != nil {
			return err
		}
		for _, chapter := range chapters {
			oldTableName := story.ID + "_" + chapter.ID + "_blocks"
			_, err := d.dynamoClient.RestoreTableFromBackup(context.TODO(), &dynamodb.RestoreTableFromBackupInput{
				BackupArn:       aws.String(chapter.BackupARN),
				TargetTableName: aws.String(oldTableName),
			})
			if err != nil {
				return err
			}
			chapterKey := map[string]types.AttributeValue{
				"chapter_id": &types.AttributeValueMemberS{Value: chapter.ID},
				"story_id":   &types.AttributeValueMemberS{Value: story.ID},
			}
			chapterUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("chapters"),
				Key:              chapterKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
			if err != nil {
				return err
			}
		}
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              storyKey,
			UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return err
		}

		storyOrSeriesID := story.ID
		if story.SeriesID != "" {
			storyOrSeriesID = story.SeriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: story.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("series"),
				Key:              seriesKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
			if err != nil {
				return err
			}
		}

		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations"),
			FilterExpression: aws.String("author = :eml AND attribute_exists(deleted_at) AND automated_deletion = :a AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":a":   &types.AttributeValueMemberBOOL{Value: true},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.dynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("associations"),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), associationUpdateInput)
			if err != nil {
				return err
			}

			associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("association_details"),
				Key:              associationKey,
				UpdateExpression: aws.String("REMOVE deleted_at, automated_deletion"),
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (d *DAO) SoftDeleteStory(email, storyID string, automated bool) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("attribute_not_exists(deleted_at) AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.dynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	chapterCount := 0
	for _, item := range chapterOut.Items {
		// Delete associated tables
		chapterID := item["chapter_id"].(*types.AttributeValueMemberS).Value
		oldTableName := storyID + "_" + chapterID + "_blocks"
		chapterStatus, err := d.CheckTableStatus(oldTableName)
		if err != nil {
			return err
		}
		if chapterStatus != "ACTIVE" {
			time.Sleep(1 * time.Second)
			go d.SoftDeleteStory(email, storyID, automated)
			return nil
		}
		deleteTableInput := &dynamodb.DeleteTableInput{
			TableName: aws.String(oldTableName),
		}

		fmt.Println("backing up", oldTableName+"-backup-"+time.Now().Format("2006-01-02-15-04-05"))

		// Create the BackupTableInput
		input := &dynamodb.CreateBackupInput{
			TableName:  aws.String(oldTableName),
			BackupName: aws.String(oldTableName + "-backup-" + time.Now().Format("2006-01-02-15-04-05")),
		}

		// Create the backup
		buResponse, err := d.dynamoClient.CreateBackup(context.TODO(), input)
		if err != nil {
			fmt.Printf("Failed to create backup for table %s, %v", oldTableName, err)
			return err
		}

		err = d.checkBackupStatus(*buResponse.BackupDetails.BackupArn)
		if err != nil {
			return err
		}

		for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
			var deletionOutput *dynamodb.DeleteTableOutput
			if deletionOutput, err = d.dynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
				if opErr, ok := err.(*smithy.OperationError); ok {
					var useErr *types.ResourceInUseException
					if errors.As(opErr.Unwrap(), &useErr) {
						delay := time.Duration((1 << uint(numRetries)) * (2 * time.Second))
						if numRetries < d.maxRetries-1 {
							fmt.Println("retrying block table deletion in", delay)
							time.Sleep(delay)
							continue
						} else {
							return err
						}
					}
				}
			}
			fmt.Println("deletion output", deletionOutput)
			break
		}
		chapterCount++

		chapterKey := map[string]types.AttributeValue{
			"chapter_id": &types.AttributeValueMemberS{Value: chapterID},
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
		}
		chapterUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("chapters"),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a, bup_arn = :barn"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n":    &types.AttributeValueMemberN{Value: now},
				":a":    &types.AttributeValueMemberBOOL{Value: automated},
				":barn": &types.AttributeValueMemberS{Value: *buResponse.BackupDetails.BackupArn},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
		if err != nil {
			return err
		}
	}

	story, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	seriesID := story.SeriesID

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories"),
		Key:              storyKey,
		UpdateExpression: aws.String("set deleted_at = :n, automated_deletion=:a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
			":a": &types.AttributeValueMemberBOOL{Value: automated},
		},
	}
	_, err = d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
	if err != nil {
		return err
	}

	storyOrSeriesID := storyID
	deletedSeries := false
	// Delete series IF no remaining stories assigned
	if seriesID != "" {
		series, err := d.GetSeriesByID(email, seriesID)
		if err != nil {
			return err
		}
		if len(series.Stories)-1 <= 0 {
			storyOrSeriesID = seriesID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: seriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("series"),
				Key:              seriesKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
			if err != nil {
				return err
			}
			deletedSeries = true
		}
	}

	if seriesID == "" || deletedSeries {
		// Delete associations
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations"),
			FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at) AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.dynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("associations"),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), associationUpdateInput)
			if err != nil {
				return err
			}

			associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
				TableName:        aws.String("association_details"),
				Key:              associationKey,
				UpdateExpression: aws.String("set deleted_at = :n, automated_deletion = :a"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":n": &types.AttributeValueMemberN{Value: now},
					":a": &types.AttributeValueMemberBOOL{Value: automated},
				},
			}
			_, err = d.dynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (d *DAO) hardDeleteStory(email, storyID string) error {
	originalStory, err := d.GetStoryByID(email, storyID)
	if err != nil {
		return err
	}
	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("author = :eml AND story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
		Select: types.SelectAllAttributes,
	}
	chapterOut, err := d.dynamoClient.Scan(context.TODO(), chapterScanInput)
	if err != nil {
		return err
	}

	for _, item := range chapterOut.Items {
		chapterID := item["id"].(*types.AttributeValueMemberS)
		// Delete associated tables
		chapterKey := map[string]types.AttributeValue{
			"story_id":   &types.AttributeValueMemberS{Value: storyID},
			"chapter_id": chapterID,
		}
		chapterDeleteInput := &dynamodb.DeleteItemInput{
			TableName: aws.String("chapters"),
			Key:       chapterKey,
		}
		_, err = d.dynamoClient.DeleteItem(context.Background(), chapterDeleteInput)
		if err != nil {
			return err
		}
	}

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: storyID},
		"author":   &types.AttributeValueMemberS{Value: email},
	}
	storyDeleteInput := &dynamodb.DeleteItemInput{
		TableName: aws.String("stories"),
		Key:       storyKey,
	}
	_, err = d.dynamoClient.DeleteItem(context.Background(), storyDeleteInput)
	if err != nil {
		return err
	}

	// Delete series
	deletedSeries := false
	storyOrSeriesID := storyID
	if originalStory.SeriesID != "" {
		series, err := d.GetSeriesByID(email, originalStory.SeriesID)
		if err != nil {
			return err
		}
		if len(series.Stories)-1 <= 0 {
			storyOrSeriesID = series.ID
			seriesKey := map[string]types.AttributeValue{
				"series_id": &types.AttributeValueMemberS{Value: originalStory.SeriesID},
				"author":    &types.AttributeValueMemberS{Value: email},
			}
			seriesDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("series"),
				Key:       seriesKey,
			}
			_, err = d.dynamoClient.DeleteItem(context.Background(), seriesDeleteInput)
			if err != nil {
				return err
			}
			// delete series portrait image from s3
			bucketName := "richdocter-series-portraits"
			parsedPath, err := url.Parse(originalStory.ImageURL)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
			deletedSeries = true
		}
	}

	if originalStory.SeriesID == "" || deletedSeries {

		// Delete associations
		associationScanInput := &dynamodb.ScanInput{
			TableName:        aws.String("associations"),
			FilterExpression: aws.String("author = :eml AND story_or_series_id = :sid"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":sid": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			},
			Select: types.SelectAllAttributes,
		}
		associationOut, err := d.dynamoClient.Scan(context.TODO(), associationScanInput)
		if err != nil {
			return err
		}

		for _, item := range associationOut.Items {
			assocID := item["association_id"].(*types.AttributeValueMemberS).Value
			associationKey := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: assocID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			associationDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("associations"),
				Key:       associationKey,
			}
			_, err = d.dynamoClient.DeleteItem(context.Background(), associationDeleteInput)
			if err != nil {
				return err
			}

			associationDetailsDeleteInput := &dynamodb.DeleteItemInput{
				TableName: aws.String("association_details"),
				Key:       associationKey,
			}
			_, err = d.dynamoClient.DeleteItem(context.Background(), associationDetailsDeleteInput)
			if err != nil {
				return err
			}
			// delete association images
			var bucketName string
			switch item["association_type"].(*types.AttributeValueMemberS).Value {
			case "character":
				bucketName = "richdocterportraits"
			case "event":
				bucketName = "richdocterevents"
			case "location":
				bucketName = "richdocterlocations"
			}
			parsedPath, err := url.Parse(item["portrait"].(*types.AttributeValueMemberS).Value)
			if err != nil {
				return err
			}
			objectKey := path.Base(parsedPath.Path)

			_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
				Bucket: &bucketName,
				Key:    &objectKey,
			})
			if err != nil {
				fmt.Println("DELETE IMAGE ERROR:", err)
			}
		}
		// delete story portrait image from s3
		bucketName := "richdocter-story-portraits"
		parsedPath, err := url.Parse(originalStory.ImageURL)
		if err != nil {
			return err
		}
		objectKey := path.Base(parsedPath.Path)

		_, err = d.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
			Bucket: &bucketName,
			Key:    &objectKey,
		})
		if err != nil {
			fmt.Println("DELETE IMAGE ERROR:", err)
		}
	}
	return nil
}

func (d *DAO) GetStoryCountByUser(email string) (count int, err error) {
	storyScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	storyOut, err := d.dynamoClient.Scan(context.TODO(), storyScanInput)
	if err != nil {
		return
	}
	return len(storyOut.Items), nil
}

func (d *DAO) GetBlockCountByChapter(email, storyID, chapterID string) (count int, err error) {

	tableName := storyID + "_" + chapterID + "_blocks"

	blockScanInput := &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists('deleted_at')"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	}
	blocksOut, err := d.dynamoClient.Scan(context.TODO(), blockScanInput)
	if err != nil {
		return
	}
	return len(blocksOut.Items), nil
}

func (d *DAO) IsUserSubscribed(email string) (subscriberID string, err error) {
	userInfo, err := d.GetUserDetails(email)
	if err != nil {
		return
	}
	return userInfo.SubscriptionID, nil
}

func (d *DAO) AddCustomerID(email, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users"),
		Key:              key,
		UpdateExpression: aws.String("set customer_id=:b"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":b": &types.AttributeValueMemberS{Value: *customerID},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err := d.dynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		fmt.Println("error saving", err)
		return err
	}
	return nil
}

func (d *DAO) AddStripeData(email, subscriptionID, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users"),
		Key:              key,
		UpdateExpression: aws.String("set subscription_id=:s, customer_id=:c"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: *subscriptionID},
			":c": &types.AttributeValueMemberS{Value: *customerID},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err := d.dynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		fmt.Println("error saving", err)
		return err
	}
	return nil
}

func (d *DAO) DeleteSeries(email string, series models.Series) error {

	for _, story := range series.Stories {
		storyKey := map[string]types.AttributeValue{
			"story_id": &types.AttributeValueMemberS{Value: story.ID},
			"author":   &types.AttributeValueMemberS{Value: email},
		}
		now := strconv.FormatInt(time.Now().Unix(), 10)
		storyUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("stories"),
			Key:              storyKey,
			UpdateExpression: aws.String("set modified_at = :n REMOVE series_id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err := d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
		if err != nil {
			return err
		}
	}
	seriesKey := map[string]types.AttributeValue{
		"series_id": &types.AttributeValueMemberS{Value: series.ID},
		"author":    &types.AttributeValueMemberS{Value: email},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	seriesUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("series"),
		Key:              seriesKey,
		UpdateExpression: aws.String("set deleted_at = :n"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err := d.dynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
	if err != nil {
		return err
	}

	return nil
}
