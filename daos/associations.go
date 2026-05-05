package daos

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strconv"
	"time"

	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) WriteAssociations(
	ctx context.Context,
	email, storyOrSeriesID string,
	associations []*models.Association,
) (err error) {
	if len(associations) == 0 {
		return errors.New("empty associations array")
	}
	batches := make([][]*models.Association, 0, (len(associations)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(associations); i += d.writeBatchSize {
		end := min(i+d.writeBatchSize, len(associations))
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
					imageFileName := rand.Intn(maxDefaultPortraitImages-1) + 1
					imgFile = s3PortraitBaseURL + strconv.Itoa(imageFileName) + ".jpg"
				case "place":
					imageFileName := rand.Intn(maxDefaultLocationImages-1) + 1
					imgFile = s3LocationBaseURL + strconv.Itoa(imageFileName) + ".jpg"
				case "event":
					imageFileName := rand.Intn(maxDefaultEventImages-1) + 1
					imgFile = s3EventBaseURL + strconv.Itoa(imageFileName) + ".jpg"
				case "item":
					imageFileName := rand.Intn(maxDefaultItemImages-1) + 1
					imgFile = s3ItemBaseURL + strconv.Itoa(imageFileName) + ".jpg"
				}
			}
			shortDescription := item.ShortDescription
			if len(item.ShortDescription) > maxShorDescriptionLength {
				shortDescription = item.ShortDescription[:maxShorDescriptionLength]
			}
			extendedDescription := item.Details.ExtendedDescription
			associations[i].Portrait = imgFile
			// Create a key for the item.
			key := map[string]types.AttributeValue{
				"association_id":     &types.AttributeValueMemberS{Value: item.ID},
				"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
			}
			// Create an update input for the item.
			updateInput := &types.Update{
				TableName: aws.String("associations" + GetTableSuffix()),
				Key:       key,
				UpdateExpression: aws.String(
					"set association_name=:nm, author=:eml, created_at=if_not_exists(created_at,:t), last_updated=:t, association_type=:at, portrait=:p, short_description=:sd, case_sensitive=:c, aliases=:al",
				),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":nm":  &types.AttributeValueMemberS{Value: item.Name},
					":eml": &types.AttributeValueMemberS{Value: email},
					":t":   &types.AttributeValueMemberN{Value: now},
					":at":  &types.AttributeValueMemberS{Value: item.Type},
					":p":   &types.AttributeValueMemberS{Value: imgFile},
					":sd":  &types.AttributeValueMemberS{Value: shortDescription},
					":c":   &types.AttributeValueMemberBOOL{Value: item.CaseSensitive},
					":al":  &types.AttributeValueMemberS{Value: item.Aliases},
				},
			}

			updateDetailsInput := &types.Update{
				TableName:        aws.String("association_details" + GetTableSuffix()),
				Key:              key,
				UpdateExpression: aws.String("set author=:eml, extended_description=:ed"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
					":ed":  &types.AttributeValueMemberS{Value: extendedDescription},
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
		awsErr, err = d.awsWriteTransaction(ctx, writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}

		awsErr, err := d.awsWriteTransaction(ctx, writeItemsDetailsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return err
}

func (d *DAO) UpdateAssociationPortraitEntryInDB(
	ctx context.Context,
	email, storyOrSeriesID, associationID, url string,
) (err error) {
	key := map[string]types.AttributeValue{
		"association_id":     &types.AttributeValueMemberS{Value: associationID},
		"story_or_series_id": &types.AttributeValueMemberS{Value: storyOrSeriesID},
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	updateInput := &dynamodb.UpdateItemInput{
		TableName:           aws.String("associations" + GetTableSuffix()),
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
	_, err = d.DynamoClient.UpdateItem(ctx, updateInput)
	if err != nil {
		return err
	}
	return nil
}

func (d *DAO) DeleteAssociations(
	ctx context.Context,
	email, storyID string,
	associations []*models.Association,
) (err error) {
	if len(associations) == 0 {
		return errors.New(("no associations provided"))
	}
	batches := make([][]*models.Association, 0, (len(associations)+(d.writeBatchSize-1))/d.writeBatchSize)
	for i := 0; i < len(associations); i += d.writeBatchSize {
		end := min(i+d.writeBatchSize, len(associations))
		batches = append(batches, associations[i:end])
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = d.IsStoryInASeries(ctx, email, storyID); err != nil {
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
				TableName: aws.String("associations" + GetTableSuffix()),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":eml": &types.AttributeValueMemberS{Value: email},
					":t":   &types.AttributeValueMemberS{Value: item.Type},
				},
			}
			deleteDetailsInput := &types.Delete{
				Key:                 key,
				TableName:           aws.String("association_details" + GetTableSuffix()),
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
		awsErr, err = d.awsWriteTransaction(ctx, writeItemsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}

		awsErr, err := d.awsWriteTransaction(ctx, writeItemsDetailsInput)
		if err != nil {
			return err
		}
		if !awsErr.IsNil() {
			return fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
		}
	}
	return err
}

func (d *DAO) GetAssociationDetails(
	ctx context.Context,
	email, storyID, associationID string,
) (*models.Association, error) {
	var (
		association *models.Association
		err         error
	)
	outStory, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
		FilterExpression: aws.String("author=:eml AND story_id=:s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":s":   &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		return association, err
	}
	storyObj := []models.Story{}
	if err = attributevalue.UnmarshalListOfMaps(outStory.Items, &storyObj); err != nil {
		return association, err
	}
	if len(storyObj) == 0 {
		return nil, fmt.Errorf("no story found for id: %s", storyID)
	}
	var storyOrSeries string
	if storyOrSeries, err = d.IsStoryInASeries(ctx, email, storyID); err != nil {
		return association, err
	}
	if storyOrSeries == "" {
		storyOrSeries = storyID
	}
	outAssociation, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("associations" + GetTableSuffix()),
		KeyConditionExpression: aws.String("association_id = :aid AND story_or_series_id = :s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":aid": &types.AttributeValueMemberS{Value: associationID},
			":s":   &types.AttributeValueMemberS{Value: storyOrSeries},
		},
		Limit: aws.Int32(1), // Limit to one result
	})
	if err != nil {
		return association, err
	}
	if len(outAssociation.Items) == 0 {
		return nil, fmt.Errorf("no association found for id: %s", associationID)
	}
	if err = attributevalue.UnmarshalMap(outAssociation.Items[0], &association); err != nil {
		return association, err
	}
	outDetails, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("association_details" + GetTableSuffix()),
		FilterExpression: aws.String("association_id=:aid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":aid": &types.AttributeValueMemberS{Value: associationID},
		},
	})
	if err != nil {
		return association, err
	}
	deets := []models.AssociationDetails{}
	if err = attributevalue.UnmarshalListOfMaps(outDetails.Items, &deets); err != nil {
		return association, err
	}
	if len(deets) == 0 {
		return association, nil
	}
	association.Details = deets[0]
	return association, nil
}

func (d *DAO) GetStoryOrSeriesAssociationThumbnails(
	ctx context.Context,
	email, storyID string,
) ([]*models.SimplifiedAssociation, error) {
	var (
		associations []*models.SimplifiedAssociation
		err          error
	)
	outStory, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("stories" + GetTableSuffix()),
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
	if storyOrSeries, err = d.IsStoryInASeries(ctx, email, storyID); err != nil {
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

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:                 aws.String("associations" + GetTableSuffix()),
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
		if len(v.ShortDescription) > maxShorDescriptionLength {
			associations[i].ShortDescription = v.ShortDescription[:maxShorDescriptionLength]
		}
	}
	return associations, nil
}
