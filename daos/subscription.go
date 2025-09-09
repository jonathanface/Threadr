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
	now := time.Now().UTC()

	// Build the SET parts
	setParts := []string{
		"subscription_id = :sid",
		"last_sub_check = :now",
	}
	attrs := map[string]types.AttributeValue{
		":sid": &types.AttributeValueMemberS{Value: sub.SubscriptionID},
		":now": &types.AttributeValueMemberS{Value: now.Format(time.RFC3339Nano)},
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
