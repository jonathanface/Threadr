package daos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) GetSubscription(ctx context.Context, email string) (sub *models.Subscription, err error) {
	logger.Debug("Getting subscription", "email", email)

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("subscriptions" + GetTableSuffix()),
		KeyConditionExpression: aws.String("email = :eml"),
		FilterExpression:       aws.String("subscriber = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":t":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		logger.Error("Failed to query subscription",
			"error", err,
			"email", email)
		return sub, err
	}

	subFromMap := []*models.Subscription{}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &subFromMap); err != nil {
		logger.Error("Failed to unmarshal subscription",
			"error", err,
			"email", email,
			"itemCount", len(out.Items))
		return sub, err
	}
	if len(subFromMap) == 0 {
		logger.Debug("No active subscription found", "email", email)
		return sub, sql.ErrNoRows
	}
	logger.Info("Subscription retrieved",
		"email", email,
		"subscriptionId", subFromMap[0].SubscriptionID)
	return subFromMap[0], nil
}

func (d *DAO) UpdateSubscription(ctx context.Context, sub models.Subscription) error {
	logger.Info("Updating subscription",
		"email", sub.Email,
		"subscriptionId", sub.SubscriptionID,
		"customerId", sub.CustomerID)

	// Build the SET parts
	setParts := []string{
		"subscription_id = :sid",
		"last_sub_check = :now",
	}
	attrs := map[string]types.AttributeValue{
		":sid": &types.AttributeValueMemberS{Value: sub.SubscriptionID},
		":now": &types.AttributeValueMemberS{Value: sub.LastSubCheck.Format(time.RFC3339Nano)},
	}

	if sub.Email == "" {
		logger.Error("UpdateSubscription called with empty email")
		return errors.New("UpdateSubscription: email is required")
	}
	if sub.CustomerID != "" {
		setParts = append(setParts, "customer_id = :cid")
		attrs[":cid"] = &types.AttributeValueMemberS{Value: sub.CustomerID}
	}

	var removeParts []string
	if !sub.CurrentSubscriptionEnd.IsZero() {
		setParts = append(setParts, "current_subscription_end = :cse")
		attrs[":cse"] = &types.AttributeValueMemberN{
			Value: strconv.FormatInt(sub.CurrentSubscriptionEnd.Unix(), 10), // seconds epoch
		}
	} else {
		removeParts = append(removeParts, "current_subscription_end")
	}

	updateExpr := "SET " + strings.Join(setParts, ", ")
	if len(removeParts) > 0 {
		updateExpr += " REMOVE " + strings.Join(removeParts, ", ")
	}

	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("subscriptions" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: sub.Email},
		},
		UpdateExpression:          aws.String(updateExpr),
		ExpressionAttributeValues: attrs,
		ReturnValues:              types.ReturnValueUpdatedNew,
	}

	_, err := d.DynamoClient.UpdateItem(ctx, input)
	if err != nil {
		logger.Error("Failed to update subscription",
			"error", err,
			"email", sub.Email,
			"subscriptionId", sub.SubscriptionID)
		return err
	}
	logger.Info("Subscription updated successfully",
		"email", sub.Email,
		"subscriptionId", sub.SubscriptionID)
	return err
}

func (d *DAO) GetEmailByCustomerID(ctx context.Context, custID string) (string, error) {
	tableName := "subscriptions" + GetTableSuffix()
	logger.Debug("Looking up email by customer ID",
		"customerId", custID,
		"tableName", tableName)

	// Use Query on the GSI instead of Scan
	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("customer-id-index"),
		KeyConditionExpression: aws.String("customer_id = :c"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":c": &types.AttributeValueMemberS{Value: custID},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		logger.Error("Failed to query subscriptions by customer ID",
			"error", err,
			"customerId", custID,
			"tableName", tableName,
			"indexName", "customer-id-index")
		return "", err
	}
	logger.Info("Query completed",
		"customerId", custID,
		"itemsFound", len(out.Items),
		"tableName", tableName,
		"indexName", "customer-id-index")

	// If query found nothing, try dumping all items in the table (for debugging)
	if len(out.Items) == 0 {
		logger.Warn("Query returned no items, attempting scan for debugging")
		scanOut, scanErr := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
			TableName: aws.String(tableName),
			Limit:     aws.Int32(5), //nolint:mnd
		})
		if scanErr == nil && len(scanOut.Items) > 0 {
			logger.Info("Sample items from table",
				"tableName", tableName,
				"sampleCount", len(scanOut.Items))
			for i, item := range scanOut.Items {
				if emailAttr, ok := item["email"].(*types.AttributeValueMemberS); ok {
					if custAttr, ok := item["customer_id"].(*types.AttributeValueMemberS); ok {
						logger.Info("Sample item",
							"index", i,
							"email", emailAttr.Value,
							"customerId", custAttr.Value)
					}
				}
			}
		}
	}
	if len(out.Items) == 0 {
		logger.Warn("No subscription found for customer ID",
			"customerId", custID,
			"tableName", tableName)
		return "", fmt.Errorf("no subscription found for customer %s", custID)
	}

	emailAttr, ok := out.Items[0]["email"].(*types.AttributeValueMemberS)
	if !ok {
		logger.Error("Email attribute missing or wrong type",
			"customerId", custID)
		return "", fmt.Errorf("email attribute missing or wrong type for customer %s", custID)
	}

	logger.Info("Email found for customer ID",
		"customerId", custID,
		"email", emailAttr.Value)
	return emailAttr.Value, nil
}
