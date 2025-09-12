package daos

import (
	"RichDocter/models"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/stripe/stripe-go/v79"
)

func (d *DAO) CreateUser(email string) (*models.UserInfo, error) {
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
			TableName:           aws.String("users" + GetTableSuffix()),
			Item:                attributes,
			ConditionExpression: aws.String("attribute_not_exists(email)"),
		},
	}

	twii.TransactItems = append(twii.TransactItems, twi)
	awsErr, err := d.awsWriteTransaction(twii)
	if err != nil {
		return nil, err
	}
	if !awsErr.IsNil() {
		return nil, fmt.Errorf("--AWSERROR-- Code:%s, Type: %s, Message: %s", awsErr.Code, awsErr.ErrorType, awsErr.Text)
	}

	user := models.UserInfo{
		Email:      email,
		Admin:      false,
		Subscriber: false,
	}
	return &user, nil
}

func (d *DAO) GetUserDetails(email string) (user *models.UserInfo, err error) {
	out, err := d.DynamoClient.Scan(context.TODO(), &dynamodb.ScanInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		FilterExpression: aws.String("email=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return nil, err
	}

	userFromMap := []models.UserInfo{}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &userFromMap); err != nil {
		return nil, err
	}
	if len(userFromMap) == 0 {
		return nil, sql.ErrNoRows
	}
	return &userFromMap[0], nil
}

/**
 * Either create a user, or update user with last login time
**/
func (d *DAO) UpsertUser(email string) (user models.UserInfo, err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
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
	if out, err = d.DynamoClient.UpdateItem(context.TODO(), input); err != nil {
		return user, err
	}
	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		fmt.Println("new account created")
	}
	return user, nil
}

func (d *DAO) UpdateUser(user models.UserInfo) (err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	queryString := "set last_accessed=:t, subscriber=:s"
	attributes := map[string]types.AttributeValue{
		":t": &types.AttributeValueMemberN{Value: now},
		":s": &types.AttributeValueMemberBOOL{Value: user.Subscriber},
	}
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: user.Email},
		},
		ReturnValues:              types.ReturnValueUpdatedNew,
		UpdateExpression:          aws.String(queryString),
		ExpressionAttributeValues: attributes,
	}
	var out *dynamodb.UpdateItemOutput
	if out, err = d.DynamoClient.UpdateItem(context.TODO(), input); err != nil {
		return err
	}
	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		fmt.Println("accountUpdated")
	}
	return
}

func toStatus(s *stripe.Subscription, found bool) SubscriptionStatus {
	active := s.Status == stripe.SubscriptionStatusActive || s.Status == stripe.SubscriptionStatusTrialing
	var cpe time.Time
	if s.CurrentPeriodEnd > 0 {
		cpe = time.Unix(s.CurrentPeriodEnd, 0)
	}
	return SubscriptionStatus{
		ID:               s.ID,
		Found:            found,
		Active:           active,
		Status:           string(s.Status),
		CurrentPeriodEnd: cpe,
	}
}

func (d *DAO) IsUserSubscribed(user models.UserInfo) (*models.UserInfo, error) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		return nil, fmt.Errorf("missing stripe secret")
	}
	sub, err := d.GetSubscription(user.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			// No subscription on file: treat as not subscribed, not an error
			user.Subscriber = false
			return &user, nil
		}
		if sub.CurrentSubscriptionEnd.After(time.Now()) {
			user.Subscriber = false
			return &user, nil
		}
		return nil, err
	}

	// Base truth from DB
	isSubscribed := sub.SubscriptionID != "" && sub.CurrentSubscriptionEnd.After(time.Now())

	// Recheck policy:
	// Re-verify with Stripe if we have a sub id AND the check is stale.
	const staleAfter = 15 * time.Minute
	shouldRecheck := sub.SubscriptionID != "" && (sub.LastSubCheck.IsZero() || time.Since(sub.LastSubCheck) > staleAfter)
	log.Println("trigger recheck?", shouldRecheck)
	if shouldRecheck {
		status, stripeErr := d.verifyStripeSubscription(sub.SubscriptionID, sub.CustomerID)
		if stripeErr == nil && status.Found {
			isSubscribed = status.Active
			sub.CurrentSubscriptionEnd = status.CurrentPeriodEnd
			sub.LastSubCheck = time.Now().UTC()
			if err := d.UpdateSubscription(*sub); err != nil {
				return nil, err
			}
		} else if stripeErr != nil {
			// Network/auth issues—log and keep DB truth
			log.Println("verifyStripeSubscription error:", stripeErr)
		}
	}
	log.Println("wtf", isSubscribed, user.Subscriber)
	// Side effects: suspend/restore stories + set notify flags for UX
	if !isSubscribed && user.Subscriber {
		user.NotifyExpired = true

		stories, err := d.GetAllStories(user.Email)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		for idx, s := range stories {
			if idx > 0 {
				go d.SoftDeleteStory(user.Email, s.ID, true)
			}
		}
		sub.CurrentSubscriptionEnd = time.Now()
		err = d.UpdateSubscription(*sub)
		if err != nil {
			return nil, err
		}
		user.Subscriber = false
		err = d.UpdateUser(user)
		if err != nil {
			return nil, err
		}
	} else if isSubscribed {
		wasSuspended, err := d.CheckForSuspendedStories(user.Email) // bool
		if err != nil {
			return nil, err
		}
		if wasSuspended {
			ctx := context.Background()
			events, err := d.RestoreAutomaticallyDeletedStories(ctx, user.Email)
			if err != nil {
				return nil, err
			}
			for ev := range events {
				if ev.OK() {
					story, err := d.GetStoryByID(user.Email, ev.StoryID)
					if err != nil {
						return nil, err
					}
					story.Inactive = false
					_, err = d.EditStory(user.Email, *story)
					if err != nil {
						log.Printf("error restoring story %s (%d/%d)\n\n", ev.Title, ev.Index, ev.Total)
						continue
					}
					// push “story X done” to logs, SSE, WebSocket, etc.
					log.Printf("story: restored %s (%d/%d)\n\n", ev.Title, ev.Index, ev.Total)
					// or broadcast JSON payload {storyId, title, index, total}
				} else {
					log.Printf("data: error restoring %s: %v (%d/%d)\n\n", ev.Title, ev.Err, ev.Index, ev.Total)
				}
			}
			user.NotifyRestored = true
		}
	}

	// Reflect final status back to caller
	user.Subscriber = isSubscribed
	return &user, nil
}

func (d *DAO) AddCustomerID(email, customerID *string) error {
	key := map[string]types.AttributeValue{
		"email": &types.AttributeValueMemberS{Value: *email},
	}
	updateInput := &dynamodb.UpdateItemInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		Key:              key,
		UpdateExpression: aws.String("set customer_id=:b"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":b": &types.AttributeValueMemberS{Value: *customerID},
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
