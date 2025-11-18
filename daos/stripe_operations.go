package daos

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	stripe "github.com/stripe/stripe-go/v79"
	stripesub "github.com/stripe/stripe-go/v79/subscription"
)

func (d *DAO) AddStripeData(email, subscriptionID, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		Key:              key,
		UpdateExpression: aws.String("set subscription_id=:s, customer_id=:c"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: *subscriptionID},
			":c": &types.AttributeValueMemberS{Value: *customerID},
		},
		ReturnValues: types.ReturnValueAllNew,
	}
	_, err := d.DynamoClient.UpdateItem(context.Background(), updateInput)
	if err != nil {
		fmt.Println("error saving", err)
		return err
	}
	return nil
}

func (d *DAO) verifyStripeSubscription(subID, customerID string) (SubscriptionStatus, error) {

	normalize := func(s string) string { return strings.TrimSpace(s) }

	subID = normalize(subID)
	customerID = normalize(customerID)

	// 1) Try direct GET if we have a candidate ID
	if subID != "" {
		s, err := stripesub.Get(subID, nil)
		if err == nil {
			return toStatus(s, true), nil
		}
		// Gracefully handle 404 resource_missing
		if se, ok := err.(*stripe.Error); ok && se.Code == stripe.ErrorCodeResourceMissing && se.Param == "id" {
			// fall through to customer lookup if we can
		} else {
			// other errors (auth, network, etc.) bubble up
			return SubscriptionStatus{}, err
		}
	}

	// 2) If we know the customer, try to find their most recent subscription
	if customerID != "" {
		lp := &stripe.SubscriptionListParams{
			Customer: stripe.String(customerID),
			Status:   stripe.String("all"),
		}
		it := stripesub.List(lp)
		var newest *stripe.Subscription
		for it.Next() {
			s := it.Subscription()
			if newest == nil || s.Created > newest.Created {
				newest = s
			}
		}
		if err := it.Err(); err != nil {
			return SubscriptionStatus{}, err
		}
		if newest != nil {
			return toStatus(newest, true), nil
		}
	}

	// 3) Nothing found
	return SubscriptionStatus{Found: false, Active: false, Status: "not_found"}, nil
}
