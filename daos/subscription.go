package daos

import (
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

func (d *DAO) GetSubscription(email string) (sub *models.Subscription, err error) {
	out, err := d.DynamoClient.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:              aws.String("subscriptions" + GetTableSuffix()),
		KeyConditionExpression: aws.String("email = :eml"),
		FilterExpression:       aws.String("subscriber = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
			":t":   &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return sub, err
	}

	subFromMap := []*models.Subscription{}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &subFromMap); err != nil {
		return sub, err
	}
	if len(subFromMap) == 0 {
		return sub, sql.ErrNoRows
	}
	return subFromMap[0], nil
}

func (d *DAO) UpdateSubscription(sub models.Subscription) error {
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

	_, err := d.DynamoClient.UpdateItem(context.TODO(), input)
	return err
}

func (d *DAO) GetEmailByCustomerId(custId string) (string, error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("subscriptions" + GetTableSuffix()),
		FilterExpression: aws.String("customer_id = :c"), // make sure matches your schema
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":c": &types.AttributeValueMemberS{Value: custId},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return "", err
	}
	if len(out.Items) == 0 {
		return "", fmt.Errorf("no subscription found for customer %s", custId)
	}

	emailAttr, ok := out.Items[0]["email"].(*types.AttributeValueMemberS)
	if !ok {
		return "", fmt.Errorf("email attribute missing or wrong type for customer %s", custId)
	}

	return emailAttr.Value, nil
}
