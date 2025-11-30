package daos

import (
	"RichDocter/logger"
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	stripe "github.com/stripe/stripe-go/v79"
	stripesub "github.com/stripe/stripe-go/v79/subscription"
)

func (d *DAO) AddStripeData(ctx context.Context, email, subscriptionID, customerID *string) error {
	logger.Info("Adding Stripe data to user",
		"email", *email,
		"subscriptionId", *subscriptionID,
		"customerId", *customerID)

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
	_, err := d.DynamoClient.UpdateItem(ctx, updateInput)
	if err != nil {
		logger.Error("Failed to add Stripe data to user",
			"error", err,
			"email", *email,
			"subscriptionId", *subscriptionID,
			"customerId", *customerID)
		return err
	}
	logger.Info("Stripe data added successfully", "email", *email)
	return nil
}

func (d *DAO) verifyStripeSubscription(subID, customerID string) (SubscriptionStatus, error) {
	logger.Debug("Verifying Stripe subscription",
		"subscriptionId", subID,
		"customerId", customerID)

	normalize := func(s string) string { return strings.TrimSpace(s) }

	subID = normalize(subID)
	customerID = normalize(customerID)

	// 1) Try direct GET if we have a candidate ID
	if subID != "" {
		logger.Debug("Attempting direct subscription lookup", "subscriptionId", subID)
		s, err := stripesub.Get(subID, nil)
		if err == nil {
			logger.Info("Subscription found via direct lookup",
				"subscriptionId", subID,
				"status", s.Status)
			return toStatus(s, true), nil
		}
		// Gracefully handle 404 resource_missing
		if se, ok := err.(*stripe.Error); ok && se.Code == stripe.ErrorCodeResourceMissing && se.Param == "id" {
			logger.Warn("Subscription not found by ID, attempting customer lookup",
				"subscriptionId", subID,
				"customerId", customerID)
			// fall through to customer lookup if we can
		} else {
			// other errors (auth, network, etc.) bubble up
			logger.Error("Stripe subscription lookup error",
				"error", err,
				"subscriptionId", subID)
			return SubscriptionStatus{}, err
		}
	}

	// 2) If we know the customer, try to find their most recent subscription
	if customerID != "" {
		logger.Debug("Looking up subscriptions by customer", "customerId", customerID)
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
			logger.Error("Failed to list customer subscriptions",
				"error", err,
				"customerId", customerID)
			return SubscriptionStatus{}, err
		}
		if newest != nil {
			logger.Info("Subscription found via customer lookup",
				"customerId", customerID,
				"subscriptionId", newest.ID,
				"status", newest.Status)
			return toStatus(newest, true), nil
		}
	}

	// 3) Nothing found
	logger.Warn("No subscription found",
		"subscriptionId", subID,
		"customerId", customerID)
	return SubscriptionStatus{Found: false, Active: false, Status: "not_found"}, nil
}
