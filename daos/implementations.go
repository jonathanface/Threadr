package daos

import (
	"RichDocter/models"
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/joho/godotenv"
)

const (
	S3_PORTRAIT_BASE_URL        = "https://richdocterportraits.s3.amazonaws.com/"
	S3_LOCATION_BASE_URL        = "https://richdocterlocations.s3.amazonaws.com/"
	S3_EVENT_BASE_URL           = "https://richdocterevents.s3.amazonaws.com/"
	MAX_DEFAULT_PORTRAIT_IMAGES = 50
	MAX_DEFAULT_LOCATION_IMAGES = 20
	MAX_DEFAULT_EVENT_IMAGES    = 20
	DYNAMO_WRITE_BATCH_SIZE     = 50
)

type DAO struct {
	dynamoClient   *dynamodb.Client
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
		dynamoClient: dynamodb.NewFromConfig(awsCfg),

		maxRetries:     maxAWSRetries,
		capacity:       blockTableMinWriteCapacity,
		writeBatchSize: DYNAMO_WRITE_BATCH_SIZE,
	}
}

func (dao *DAO) GetAllStandalone(email string) (stories []*models.Story, err error) {
	out, err := dao.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND attribute_not_exists(series) AND attribute_not_exists(deleted_at)"),
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
	var outChaps *dynamodb.QueryOutput
	for i := 0; i < len(stories); i++ {
		queryInput := &dynamodb.QueryInput{
			TableName:              aws.String("chapters"),
			IndexName:              aws.String("story_title-chapter_num-index"),
			KeyConditionExpression: aws.String("chapter_num > :cn AND story_title=:s"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":cn": &types.AttributeValueMemberN{
					Value: "-1",
				},
				":s": &types.AttributeValueMemberS{
					Value: stories[i].Title,
				},
			},
		}

		if outChaps, err = dao.dynamoClient.Query(context.TODO(), queryInput); err != nil {
			//RespondWithError(w, http.StatusInternalServerError, err.Error())
			return nil, err
		}
		chapters := []models.Chapter{}
		if err = attributevalue.UnmarshalListOfMaps(outChaps.Items, &chapters); err != nil {
			return nil, err
		}
		stories[i].Chapters = chapters
	}
	return stories, nil
}

func (d *DAO) GetStoryByName(email, storyTitle string) (*models.Story, error) {
	var (
		story models.Story
		err   error
	)
	out, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_title=:s AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyTitle},
		},
	})
	if err != nil {
		return &story, err
	}

	storyFromMap := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &storyFromMap); err != nil {
		return &story, err
	}
	var outChaps *dynamodb.QueryOutput
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("chapters"),
		IndexName:              aws.String("story_title-chapter_num-index"),
		KeyConditionExpression: aws.String("chapter_num > :cn AND story_title=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cn": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":s": &types.AttributeValueMemberS{
				Value: storyTitle,
			},
		},
	}

	if outChaps, err = d.dynamoClient.Query(context.TODO(), queryInput); err != nil {
		return &story, err
	}
	chapters := []models.Chapter{}
	if err = attributevalue.UnmarshalListOfMaps(outChaps.Items, &chapters); err != nil {
		return &story, err
	}
	if len(storyFromMap) == 0 {
		return &story, fmt.Errorf("table not ready")
	}
	storyFromMap[0].Chapters = chapters
	return &storyFromMap[0], nil
}

func (d *DAO) GetStoryParagraphs(email, storyTitle, chapter, startKey string) (*models.BlocksData, error) {
	var (
		err    error
		blocks models.BlocksData
	)
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := d.sanitizeTableName(storyTitle)
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"

	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("story-place-index"),
		KeyConditionExpression: aws.String("#place>:p AND story=:s"),
		ExpressionAttributeNames: map[string]string{
			"#place": "place",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":s": &types.AttributeValueMemberS{
				Value: storyTitle,
			},
		},
	}

	if startKey != "" {
		queryInput.ExclusiveStartKey = map[string]types.AttributeValue{
			"keyID": &types.AttributeValueMemberS{Value: startKey},
		}
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
		return &blocks, err
	}
	blocks.Items = items
	blocks.LastEvaluated = lastKey
	return &blocks, nil
}

func (d *DAO) GetStoryAssociations(email, storyTitle string) ([]*models.Association, error) {
	var (
		associations []*models.Association
		err          error
	)
	outStory, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("stories"),
		FilterExpression: aws.String("author=:eml AND story_title=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyTitle},
		},
	})
	if err != nil {
		return associations, err
	}
	storyObj := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &storyObj); err != nil {
		return associations, err
	}
	filterString := "author=:eml AND story=:s"
	expressionValues := map[string]types.AttributeValue{
		":eml": &types.AttributeValueMemberS{Value: email},
		":s":   &types.AttributeValueMemberS{Value: storyTitle},
	}
	if storyObj[0].Series != "" {
		outStory, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("author=:eml AND series_title=:srs"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":srs": &types.AttributeValueMemberS{Value: storyObj[0].Series},
			},
		})
		if err != nil {
			return associations, err
		}
		seriesObj := []models.Series{}
		if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &seriesObj); err != nil {
			return associations, err
		}
		filterString = "author=:eml AND (story=:s"
		for i, v := range seriesObj {
			idxStr := fmt.Sprint(i)
			filterString += " OR story=:" + idxStr + ""
			expressionValues[":"+idxStr] = &types.AttributeValueMemberS{Value: v.StoryTitle}
		}
		filterString += ")"
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

	for i, v := range associations {
		outDetails, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("association_details"),
			FilterExpression: aws.String("author=:eml AND story=:s AND association_name=:n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":s":   &types.AttributeValueMemberS{Value: storyTitle},
				":n":   &types.AttributeValueMemberS{Value: v.Name},
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
	return associations, nil
}

func (d *DAO) GetAllSeries(email string) (series []models.Series, err error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("series"),
		IndexName:              aws.String("author-place-index"),
		KeyConditionExpression: aws.String("place > :p AND author=:eml"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
	}
	var out *dynamodb.QueryOutput
	if out, err = d.dynamoClient.Query(context.TODO(), queryInput); err != nil {
		return series, err
	}
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &series); err != nil {
		return series, err
	}
	return series, err
}

func (d *DAO) GetSeriesVolumes(email, seriesTitle string) (volumes []*models.Story, err error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String("series"),
		IndexName:              aws.String("author-place-index"),
		KeyConditionExpression: aws.String("place > :p AND author=:eml"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberN{
				Value: "-1",
			},
			":eml": &types.AttributeValueMemberS{
				Value: email,
			},
		},
		FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
	}

	var seriesOutput *dynamodb.QueryOutput
	if seriesOutput, err = d.dynamoClient.Query(context.TODO(), queryInput); err != nil {
		return volumes, err
	}

	for _, seriesEntry := range seriesOutput.Items {
		fmt.Println("found series", seriesEntry["story_title"])
		storyTitle := ""
		if av, ok := seriesEntry["story_title"].(*types.AttributeValueMemberS); ok {
			storyTitle = av.Value
		} else {
			return volumes, err
		}

		storiesOutput, err := d.dynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
			TableName:        aws.String("stories"),
			FilterExpression: aws.String("author=:eml AND story_title=:s AND series<>:f"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":eml": &types.AttributeValueMemberS{Value: email},
				":s":   &types.AttributeValueMemberS{Value: storyTitle},
				":f":   &types.AttributeValueMemberS{Value: ""},
			},
		})
		if err != nil {
			return volumes, err
		}
		story := []models.Story{}
		if err = attributevalue.UnmarshalListOfMaps(storiesOutput.Items, &story); err != nil {
			return volumes, err
		}
		var outChaps *dynamodb.QueryOutput
		queryInput := &dynamodb.QueryInput{
			TableName:              aws.String("chapters"),
			IndexName:              aws.String("story_title-chapter_num-index"),
			KeyConditionExpression: aws.String("chapter_num > :cn AND story_title=:s"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":cn": &types.AttributeValueMemberN{
					Value: "-1",
				},
				":s": &types.AttributeValueMemberS{
					Value: storyTitle,
				},
			},
		}

		if outChaps, err = d.dynamoClient.Query(context.TODO(), queryInput); err != nil {
			return volumes, err
		}
		chapters := []models.Chapter{}
		if err = attributevalue.UnmarshalListOfMaps(outChaps.Items, &chapters); err != nil {
			return volumes, err
		}
		story[0].Chapters = chapters
		volumes = append(volumes, &story[0])
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

func (d *DAO) ResetBlockOrder(email, story string, storyBlocks *models.StoryBlocks) (err error) {
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := d.sanitizeTableName(story)
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"

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
		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) WriteBlocks(email, story string, storyBlocks *models.StoryBlocks) (err error) {
	emailSafe := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := d.sanitizeTableName(story)
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := emailSafe + "_" + safeStory + "_" + chapter + "_blocks"

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
				UpdateExpression: aws.String("set chunk=:c, story=:s, place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":c": &types.AttributeValueMemberS{Value: string(item.Chunk)},
					":s": &types.AttributeValueMemberS{Value: story},
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
		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) WriteAssociations(email, story string, associations []*models.Association) (err error) {

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
				rand.Seed(time.Now().UnixNano())
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
			if shortDescription == "" {
				shortDescription = "You may edit this descriptive text by clicking on the association."
			}
			extendedDescription := item.Details.ExtendedDescription
			if extendedDescription == "" {
				extendedDescription = "Here you can put some extended details.\nShift+Enter for new lines."
			}
			associations[i].Portrait = imgFile
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_name": &types.AttributeValueMemberS{Value: item.Name},
				"author":           &types.AttributeValueMemberS{Value: email},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName:        aws.String("associations"),
				Key:              key,
				UpdateExpression: aws.String("set created_at=if_not_exists(created_at,:t), story=:s, association_type=:at, portrait=:p, short_description=:sd"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t":  &types.AttributeValueMemberN{Value: now},
					":at": &types.AttributeValueMemberS{Value: item.Type},
					":s":  &types.AttributeValueMemberS{Value: story},
					":p":  &types.AttributeValueMemberS{Value: imgFile},
					":sd": &types.AttributeValueMemberS{Value: shortDescription},
				},
			}

			updateDetailsInput := &types.Update{
				TableName:        aws.String("association_details"),
				Key:              key,
				UpdateExpression: aws.String("set story=:s, case_sensitive=:c, extended_description=:ed, aliases=:al"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s":  &types.AttributeValueMemberS{Value: story},
					":c":  &types.AttributeValueMemberBOOL{Value: item.Details.CaseSensitive},
					":ed": &types.AttributeValueMemberS{Value: extendedDescription},
					":al": &types.AttributeValueMemberS{Value: item.Details.Aliases},
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
		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}

		if err = d.awsWriteTransaction(writeItemsDetailsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) UpdatePortrait(email, associationName, url string) (err error) {
	key := map[string]types.AttributeValue{
		"association_name": &types.AttributeValueMemberS{Value: associationName},
		"author":           &types.AttributeValueMemberS{Value: email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("associations"),
		Key:              key,
		UpdateExpression: aws.String("set portrait=:p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberS{Value: url},
		},
	}
	_, err = d.dynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		return err
	}
	return nil
}

func (d *DAO) CreateChapter(email, story string, chapter models.Chapter) (err error) {
	var chapTwi types.TransactWriteItem
	if chapTwi, err = d.generateStoryChapterTransaction(email, story, chapter.ChapterNum, chapter.ChapterTitle); err != nil {
		return
	}

	twii := &dynamodb.TransactWriteItemsInput{}
	twii.TransactItems = append(twii.TransactItems, chapTwi)
	if err = d.awsWriteTransaction(twii); err != nil {
		return
	}
	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	story = d.sanitizeTableName(story)
	chapterNum := strconv.Itoa(chapter.ChapterNum)

	tableName := email + "_" + story + "_" + chapterNum + "_blocks"
	if err = d.createBlockTable(tableName); err != nil {
		return
	}
	return
}

func (d *DAO) CreateStory(email string, story models.Story) (err error) {
	fmt.Println("creating story", story)
	twii := &dynamodb.TransactWriteItemsInput{}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	sqlString := "set description=:descr, created_at=:t"
	attributes := map[string]types.AttributeValue{
		":descr": &types.AttributeValueMemberS{Value: story.Description},
		":t":     &types.AttributeValueMemberN{Value: now},
	}
	if story.Series != "" {
		sqlString = "set description=:descr, series=:srs, created_at=:t"
		attributes[":srs"] = &types.AttributeValueMemberS{Value: story.Series}
	}
	twi := types.TransactWriteItem{
		Update: &types.Update{
			TableName: aws.String("stories"),
			Key: map[string]types.AttributeValue{
				"story_title": &types.AttributeValueMemberS{Value: story.Title},
				"author":      &types.AttributeValueMemberS{Value: email},
			},
			ConditionExpression:       aws.String("attribute_not_exists(story_title)"),
			UpdateExpression:          aws.String(sqlString),
			ExpressionAttributeValues: attributes,
		},
	}
	twii.TransactItems = append(twii.TransactItems, twi)

	var chapTwi types.TransactWriteItem
	if chapTwi, err = d.generateStoryChapterTransaction(email, story.Title, 1, "Chapter 1"); err != nil {
		return
	}
	twii.TransactItems = append(twii.TransactItems, chapTwi)

	if story.Series != "" {
		params := &dynamodb.ScanInput{
			TableName:        aws.String("series"),
			FilterExpression: aws.String("series_title=:st"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":st": &types.AttributeValueMemberS{Value: story.Series},
			},
			Select: types.SelectCount,
		}

		// Execute the scan operation and get the count
		var resp *dynamodb.ScanOutput
		if resp, err = d.dynamoClient.Scan(context.TODO(), params); err != nil {
			return
		}
		seriesTwi := types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String("series"),
				Key: map[string]types.AttributeValue{
					"series_title": &types.AttributeValueMemberS{Value: story.Series},
					"story_title":  &types.AttributeValueMemberS{Value: story.Title},
				},
				ConditionExpression: aws.String("attribute_not_exists(story_title)"),
				UpdateExpression:    aws.String("set author=:eml, created_at=:t, place=:p"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":t":   &types.AttributeValueMemberN{Value: now},
					":eml": &types.AttributeValueMemberS{Value: email},
					":p":   &types.AttributeValueMemberN{Value: strconv.Itoa(int(resp.Count))},
				},
			},
		}
		twii.TransactItems = append(twii.TransactItems, seriesTwi)
	}

	if err = d.awsWriteTransaction(twii); err != nil {
		return
	}
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := d.sanitizeTableName(story.Title)
	tableName := safeEmail + "_" + safeStory + "_1_blocks"
	if err = d.createBlockTable(tableName); err != nil {
		return err
	}
	return
}

func (d *DAO) DeleteStoryParagraphs(email, storyTitle string, storyBlocks *models.StoryBlocks) (err error) {

	email = strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	safeStory := d.sanitizeTableName(storyTitle)
	chapter := strconv.Itoa(storyBlocks.Chapter)
	tableName := email + "_" + safeStory + "_" + chapter + "_blocks"

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

		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) DeleteAssociations(email, storyTitle string, associations []*models.Association) (err error) {
	batches := make([][]*models.Association, 0, (len(associations)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(associations); i += d.writeBatchSize {
		end := i + d.writeBatchSize
		if end > len(associations) {
			end = len(associations)
		}
		batches = append(batches, associations[i:end])
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
				"association_name": &types.AttributeValueMemberS{Value: item.Name},
				"author":           &types.AttributeValueMemberS{Value: email},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("associations"),
				ConditionExpression: aws.String("story=:s AND association_type=:t"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s": &types.AttributeValueMemberS{Value: storyTitle},
					":t": &types.AttributeValueMemberS{Value: item.Type},
				},
			}
			deleteDetailsInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("association_details"),
				ConditionExpression: aws.String("story=:s"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":s": &types.AttributeValueMemberS{Value: storyTitle},
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

		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}

		if err = d.awsWriteTransaction(writeItemsDetailsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) DeleteChapters(email, storyTitle string, chapters []models.Chapter) (err error) {
	tblEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	tblStory := d.sanitizeTableName(storyTitle)

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
				"chapter_title": &types.AttributeValueMemberS{Value: item.ChapterTitle},
				"story_title":   &types.AttributeValueMemberS{Value: storyTitle},
			}

			// Create a delete input for the item.
			deleteInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("chapters"),
				ConditionExpression: aws.String("author=:eml"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
				},
			}

			// Create a transaction write item for the update operation.
			writeItem := types.TransactWriteItem{
				Delete: deleteInput,
			}

			// Add the transaction write item to the list of transaction write items.
			writeItemsInput.TransactItems[i] = writeItem

			chapter := strconv.Itoa(item.ChapterNum)
			tableName := tblEmail + "_" + tblStory + "_" + chapter + "_blocks"

			deleteTableInput := &dynamodb.DeleteTableInput{
				TableName: aws.String(tableName),
			}

			// Delete the table
			if _, err = d.dynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
				return
			}
		}
		if err = d.awsWriteTransaction(writeItemsInput); err != nil {
			return
		}
	}
	return
}

func (d *DAO) DeleteStory(email, storyTitle, seriesTitle string) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Delete chapters
	chapterScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("chapters"),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at) AND story_title = :st"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":st":  &types.AttributeValueMemberS{Value: storyTitle},
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
		safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		safeStory := d.sanitizeTableName(storyTitle)
		chapNum := strconv.Itoa(chapterCount + 1)
		oldTableName := safeEmail + "_" + safeStory + "_" + chapNum + "_blocks"
		deleteTableInput := &dynamodb.DeleteTableInput{
			TableName: aws.String(oldTableName),
		}
		for numRetries := 0; numRetries < d.maxRetries; numRetries++ {
			if _, err = d.dynamoClient.DeleteTable(context.Background(), deleteTableInput); err != nil {
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
			break
		}
		chapterCount++

		chapterTitle := item["chapter_title"].(*types.AttributeValueMemberS).Value
		chapterKey := map[string]types.AttributeValue{
			"chapter_title": &types.AttributeValueMemberS{Value: chapterTitle},
			"story_title":   &types.AttributeValueMemberS{Value: storyTitle},
		}
		chapterUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("chapters"),
			Key:              chapterKey,
			UpdateExpression: aws.String("set deleted_at = :n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), chapterUpdateInput)
		if err != nil {
			return err
		}
	}

	// Delete story
	storyKey := map[string]types.AttributeValue{
		"story_title": &types.AttributeValueMemberS{Value: storyTitle},
		"author":      &types.AttributeValueMemberS{Value: email},
	}
	storyUpdateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("stories"),
		Key:              storyKey,
		UpdateExpression: aws.String("set deleted_at = :n"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n": &types.AttributeValueMemberN{Value: now},
		},
	}
	_, err = d.dynamoClient.UpdateItem(context.Background(), storyUpdateInput)
	if err != nil {
		return err
	}

	// Delete series
	if len(seriesTitle) > 0 {
		seriesKey := map[string]types.AttributeValue{
			"series_title": &types.AttributeValueMemberS{Value: seriesTitle},
			"story_title":  &types.AttributeValueMemberS{Value: storyTitle},
		}
		seriesUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("series"),
			Key:              seriesKey,
			UpdateExpression: aws.String("set deleted_at = :n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), seriesUpdateInput)
		if err != nil {
			return err
		}
	}

	// Delete associations
	associationScanInput := &dynamodb.ScanInput{
		TableName:        aws.String("associations"),
		FilterExpression: aws.String("author = :eml AND attribute_not_exists(deleted_at) AND story = :st"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":st":  &types.AttributeValueMemberS{Value: storyTitle},
		},
		Select: types.SelectAllAttributes,
	}
	associationOut, err := d.dynamoClient.Scan(context.TODO(), associationScanInput)
	if err != nil {
		return err
	}

	for _, item := range associationOut.Items {
		assocTitle := item["association_name"].(*types.AttributeValueMemberS).Value
		associationKey := map[string]types.AttributeValue{
			"association_name": &types.AttributeValueMemberS{Value: assocTitle},
			"author":           &types.AttributeValueMemberS{Value: email},
		}
		associationUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("associations"),
			Key:              associationKey,
			UpdateExpression: aws.String("set deleted_at = :n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), associationUpdateInput)
		if err != nil {
			return err
		}

		associationDetailsUpdateInput := &dynamodb.UpdateItemInput{
			TableName:        aws.String("association_details"),
			Key:              associationKey,
			UpdateExpression: aws.String("set deleted_at = :n"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":n": &types.AttributeValueMemberN{Value: now},
			},
		}
		_, err = d.dynamoClient.UpdateItem(context.Background(), associationDetailsUpdateInput)
		if err != nil {
			return err
		}
	}
	return nil
}
