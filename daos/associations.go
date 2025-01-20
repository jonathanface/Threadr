package daos

import (
	"RichDocter/models"
	"context"
	"fmt"
	"math/rand"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) WriteAssociations(email, storyOrSeriesID string, associations []*models.Association) (err error) {
	if len(associations) == 0 {
		return fmt.Errorf("empty associations array")
	}
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
				case "item":
					imageFileName := rand.Intn(MAX_DEFAULT_ITEM_IMAGES-1) + 1
					imgFile = S3_ITEM_BASE_URL + strconv.Itoa(imageFileName) + ".jpg"
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
	_, err = d.DynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		return err
	}
	return nil
}

func (d *DAO) DeleteAssociations(email, storyID string, associations []*models.Association) (err error) {
	if len(associations) == 0 {
		return fmt.Errorf(("no associations provided"))
	}
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

func (d *DAO) GetStoryOrSeriesAssociationDetails(email, storyID string, needDetails bool) ([]*models.Association, error) {
	var (
		associations []*models.Association
		err          error
	)
	outStory, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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

	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
			outDetails, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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

func (d *DAO) GetStoryOrSeriesAssociationThumbnails(email, storyID string, needDetails bool) ([]*models.SimplifiedAssociation, error) {
	var (
		associations []*models.SimplifiedAssociation
		err          error
	)
	outStory, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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

	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
			if len(associations[i].ShortDescription) > 120 {
				associations[i].ShortDescription = associations[i].ShortDescription[:120] + "..."
			}
			outDetails, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
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
				associations[i].Aliases = deets[0].Aliases
				associations[i].CaseSensitive = deets[0].CaseSensitive
			}
		}
	}

	return associations, nil
}
