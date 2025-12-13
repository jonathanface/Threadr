package daos

import (
	"RichDocter/logger"
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

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
		return fmt.Errorf("UpdateSubscription: email is required")
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

func (d *DAO) GetEmailByCustomerId(ctx context.Context, custId string) (string, error) {
	tableName := "subscriptions" + GetTableSuffix()
	logger.Debug("Looking up email by customer ID",
		"customerId", custId,
		"tableName", tableName)

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("customer_id = :c"), // make sure matches your schema
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":c": &types.AttributeValueMemberS{Value: custId},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		logger.Error("Failed to scan subscriptions by customer ID",
			"error", err,
			"customerId", custId,
			"tableName", tableName)
		return "", err
	}
	logger.Info("Scan completed",
		"customerId", custId,
		"itemsFound", len(out.Items),
		"tableName", tableName)
	if len(out.Items) == 0 {
		logger.Warn("No subscription found for customer ID",
			"customerId", custId,
			"tableName", tableName)
		return "", fmt.Errorf("no subscription found for customer %s", custId)
	}

	emailAttr, ok := out.Items[0]["email"].(*types.AttributeValueMemberS)
	if !ok {
		logger.Error("Email attribute missing or wrong type",
			"customerId", custId)
		return "", fmt.Errorf("email attribute missing or wrong type for customer %s", custId)
	}

	logger.Info("Email found for customer ID",
		"customerId", custId,
		"email", emailAttr.Value)
	return emailAttr.Value, nil
}
