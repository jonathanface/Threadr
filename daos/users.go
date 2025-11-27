package daos

import (
	"RichDocter/logger"
	"RichDocter/models"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sesv2types "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
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
func (d *DAO) UpsertUser(email string) (*models.UserInfo, error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		ReturnValues:     types.ReturnValueAllNew,
		UpdateExpression: aws.String("set last_accessed=:t, created_at=if_not_exists(created_at, :t)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
		},
	}
	var out *dynamodb.UpdateItemOutput
	var err error
	if out, err = d.DynamoClient.UpdateItem(context.TODO(), input); err != nil {
		return nil, err
	}

	var user models.UserInfo
	if out.Attributes != nil {
		if err := attributevalue.UnmarshalMap(out.Attributes, &user); err != nil {
			return nil, err
		}
	}

	var createdAt string
	attributevalue.Unmarshal(out.Attributes["created_at"], &createdAt)

	if createdAt == now {
		logger.Info("New account created", "email", email)
		// Send emails asynchronously to avoid blocking user creation
		go func() {
			// Send welcome email to user
			if err := sendWelcomeEmail(email); err != nil {
				logger.Error("Failed to send welcome email",
					"email", email,
					"error", err)
			} else {
				logger.Info("Welcome email sent successfully", "email", email)
			}

			// Send notification email to support
			if err := sendNewUserNotificationEmail(email); err != nil {
				logger.Error("Failed to send new user notification email",
					"email", email,
					"error", err)
			} else {
				logger.Info("New user notification email sent successfully", "email", email)
			}
		}()
	}
	return &user, nil
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
			d.kickoffRestoreAsync(user.Email)
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

// sendWelcomeEmail sends a welcome email to a new user
func sendWelcomeEmail(userEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send welcome email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	emailBody := `Welcome to Docter!

Thank you for signing up. We're excited to help you organize your story and keep track of all your characters, places, and events.

Getting Started:

1. Create your first story or series
2. Add chapters and start writing
3. Highlight text to create references to characters, places, and events
4. Click any reference to view its details without losing your place

Visit Docter: https://docter.io

Need help? Have questions or feedback? Email us at support@docter.io - we'd love to hear from you!

Happy writing!
The Docter Team`

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{userEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String("Welcome to Docter"),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String(emailBody),
					},
				},
			},
		},
	}

	_, err = svc.SendEmail(context.TODO(), input)
	if err != nil {
		return err
	}
	return nil
}

// sendNewUserNotificationEmail sends an email notification to support when a new user signs up
func sendNewUserNotificationEmail(userEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send alert email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	emailBody := "A new user has signed up for docter: " + userEmail

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{"support@docter.io"},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String("New User Signup"),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String(emailBody),
					},
				},
			},
		},
	}

	_, err = svc.SendEmail(context.TODO(), input)
	if err != nil {
		return err
	}
	return nil
}
