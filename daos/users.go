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

func (d *DAO) CreateUser(ctx context.Context, email string) (*models.UserInfo, error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// First, check if this is a re-registration of a deleted account
	existingUser, err := d.GetUserByEmailIncludingDeleted(ctx, email)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// If user exists and was deleted, we need to use Update instead of Put
	if existingUser != nil && existingUser.DeletedAt != "" {
		// 1. Restore user account
		input := &dynamodb.UpdateItemInput{
			TableName: aws.String("users" + GetTableSuffix()),
			Key: map[string]types.AttributeValue{
				"email": &types.AttributeValueMemberS{Value: email},
			},
			UpdateExpression: aws.String("set created_at=:t, last_accessed=:t, admin=:a, subscriber=:s REMOVE deleted_at, customer_id, first_name, last_name"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":t": &types.AttributeValueMemberN{Value: now},
				":a": &types.AttributeValueMemberBOOL{Value: false},
				":s": &types.AttributeValueMemberBOOL{Value: false},
			},
			ReturnValues: types.ReturnValueAllNew,
		}

		if _, err := d.DynamoClient.UpdateItem(ctx, input); err != nil {
			return nil, err
		}

		// 2. Restore all soft-deleted stories (undelete them)
		stories, err := d.GetAllStoriesIncludingDeleted(ctx, email)
		if err != nil && err != sql.ErrNoRows {
			logger.Warn("Failed to get deleted stories for restoration", "email", email, "error", err)
			// Continue anyway - don't fail account recreation
		} else {
			for _, story := range stories {
				// Undelete the story by removing deleted_at
				if err := d.RestoreStory(ctx, email, story.ID); err != nil {
					logger.Warn("Failed to restore story", "email", email, "storyID", story.ID, "error", err)
					// Continue with other stories
				}
			}
			logger.Info("Restored stories for returning user", "email", email, "count", len(stories))
		}

		// 3. Restore all soft-deleted series
		series, err := d.GetAllSeriesIncludingDeleted(ctx, email)
		if err != nil && err != sql.ErrNoRows {
			logger.Warn("Failed to get deleted series for restoration", "email", email, "error", err)
			// Continue anyway
		} else {
			for _, s := range series {
				// Undelete the series by removing deleted_at
				if err := d.RestoreSeries(ctx, email, s.ID); err != nil {
					logger.Warn("Failed to restore series", "email", email, "seriesID", s.ID, "error", err)
					// Continue with other series
				}
			}
			logger.Info("Restored series for returning user", "email", email, "count", len(series))
		}

		user := models.UserInfo{
			Email:         email,
			Admin:         false,
			Subscriber:    false,
			ReturningUser: true, // Flag for returning deleted user
		}

		logger.Info("Account re-created (was previously deleted)", "email", email)
		// Send emails and create welcome alert asynchronously
		go func() {
			bgCtx := context.Background()
			if err := sendWelcomeEmail(email); err != nil {
				logger.Error("Failed to send welcome email", "email", email, "error", err)
			} else {
				logger.Info("Welcome email sent successfully", "email", email)
			}
			if err := sendNewUserNotificationEmail(email); err != nil {
				logger.Error("Failed to send new user notification email", "email", email, "error", err)
			} else {
				logger.Info("New user notification email sent successfully", "email", email)
			}
			d.createWelcomeBackAlert(bgCtx, email)
			d.createSubscribeNowAlert(bgCtx, email)
		}()

		return &user, nil
	}

	// Normal new user creation
	twii := &dynamodb.TransactWriteItemsInput{}
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
	awsErr, err := d.awsWriteTransaction(ctx, twii)
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
		NewUser:    true, // Flag for brand new user
	}

	logger.Info("New account created", "email", email)
	// Send emails and create welcome alert asynchronously
	go func() {
		bgCtx := context.Background()

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

		// Create welcome alert and subscribe prompt
		d.createWelcomeAlert(bgCtx, email)
		d.createSubscribeNowAlert(bgCtx, email)
	}()

	return &user, nil
}

func (d *DAO) GetUserDetails(ctx context.Context, email string) (user *models.UserInfo, err error) {
	tableName := "users" + GetTableSuffix()
	logger.Info("GetUserDetails called",
		"email", email,
		"tableName", tableName)

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("email=:eml AND attribute_not_exists(deleted_at)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":eml": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("DynamoDB Scan failed in GetUserDetails",
			"email", email,
			"tableName", tableName,
			"error", err,
			"errorType", fmt.Sprintf("%T", err))
		return nil, err
	}
	logger.Info("DynamoDB Scan succeeded", "email", email, "itemCount", len(out.Items))

	// Log raw items for debugging subscriber field issue
	if len(out.Items) > 0 {
		logger.Info("Raw DynamoDB item for user", "email", email, "rawItem", out.Items[0])
	}

	userFromMap := []models.UserInfo{}

	if err = attributevalue.UnmarshalListOfMaps(out.Items, &userFromMap); err != nil {
		logger.Error("Failed to unmarshal user data", "email", email, "error", err)
		return nil, err
	}
	if len(userFromMap) == 0 {
		return nil, sql.ErrNoRows
	}

	logger.Info("GetUserDetails result",
		"email", email,
		"subscriber", userFromMap[0].Subscriber,
		"admin", userFromMap[0].Admin,
		"firstName", userFromMap[0].FirstName,
		"lastName", userFromMap[0].LastName)

	return &userFromMap[0], nil
}

// GetAllUsersWithStories retrieves all users with their story titles, sorted by last_accessed
// This is used by the admin area
func (d *DAO) GetAllUsersWithStories(ctx context.Context) ([]models.AdminUserSummary, error) {
	tableName := "users" + GetTableSuffix()

	// Scan all users (excluding deleted)
	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		FilterExpression: aws.String("attribute_not_exists(deleted_at)"),
	})
	if err != nil {
		return nil, err
	}

	// Define a struct to capture the raw user data including last_accessed
	type userWithAccess struct {
		Email        string `dynamodbav:"email"`
		FirstName    string `dynamodbav:"first_name"`
		LastName     string `dynamodbav:"last_name"`
		Subscriber   bool   `dynamodbav:"subscriber"`
		LastAccessed int64  `dynamodbav:"last_accessed"`
	}

	var users []userWithAccess
	if err = attributevalue.UnmarshalListOfMaps(out.Items, &users); err != nil {
		return nil, err
	}

	// Build the result with story info including series
	result := make([]models.AdminUserSummary, 0, len(users))
	for _, u := range users {
		// Get stories for this user
		stories, err := d.GetAllStories(ctx, u.Email)
		var storyInfos []models.AdminStoryInfo
		if err == nil {
			// Build a map of seriesID -> series title for this user
			seriesMap := make(map[string]string)
			allSeries, seriesErr := d.GetAllSeriesWithStories(ctx, u.Email, true)
			if seriesErr == nil {
				for _, s := range allSeries {
					seriesMap[s.ID] = s.Title
				}
			}

			for _, s := range stories {
				info := models.AdminStoryInfo{
					Title: s.Title,
				}
				if s.SeriesID != "" {
					if seriesTitle, ok := seriesMap[s.SeriesID]; ok {
						info.SeriesTitle = seriesTitle
					}
				}
				storyInfos = append(storyInfos, info)
			}
		}

		result = append(result, models.AdminUserSummary{
			Email:        u.Email,
			FirstName:    u.FirstName,
			LastName:     u.LastName,
			Subscriber:   u.Subscriber,
			LastAccessed: u.LastAccessed,
			Stories:      storyInfos,
		})
	}

	// Sort by last_accessed descending (most recent first)
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j].LastAccessed > result[i].LastAccessed {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	return result, nil
}

// GetUserByEmailIncludingDeleted retrieves a user including deleted users
func (d *DAO) GetUserByEmailIncludingDeleted(ctx context.Context, email string) (*models.UserInfo, error) {
	tableName := "users" + GetTableSuffix()

	out, err := d.DynamoClient.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		return nil, err
	}

	if out.Item == nil {
		return nil, sql.ErrNoRows
	}

	var user models.UserInfo
	if err := attributevalue.UnmarshalMap(out.Item, &user); err != nil {
		return nil, err
	}

	return &user, nil
}

/**
 * Either create a user, or update user with last login time
**/
func (d *DAO) UpsertUser(ctx context.Context, email string) (*models.UserInfo, error) {
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
	if out, err = d.DynamoClient.UpdateItem(ctx, input); err != nil {
		return nil, err
	}

	var user models.UserInfo
	if out.Attributes != nil {
		if err := attributevalue.UnmarshalMap(out.Attributes, &user); err != nil {
			return nil, err
		}
	}

	return &user, nil
}

func (d *DAO) UpdateUser(ctx context.Context, user models.UserInfo) (err error) {
	now := strconv.FormatInt(time.Now().Unix(), 10)
	queryString := "set last_accessed=:t, subscriber=:s"
	attributes := map[string]types.AttributeValue{
		":t": &types.AttributeValueMemberN{Value: now},
		":s": &types.AttributeValueMemberBOOL{Value: user.Subscriber},
	}

	// Optionally update first_name and last_name if provided
	if user.FirstName != "" {
		queryString += ", first_name=:fn"
		attributes[":fn"] = &types.AttributeValueMemberS{Value: user.FirstName}
	}
	if user.LastName != "" {
		queryString += ", last_name=:ln"
		attributes[":ln"] = &types.AttributeValueMemberS{Value: user.LastName}
	}
	if user.AuthType != "" {
		queryString += ", auth_type=:at"
		attributes[":at"] = &types.AttributeValueMemberS{Value: user.AuthType}
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
	if _, err = d.DynamoClient.UpdateItem(ctx, input); err != nil {
		return err
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

func (d *DAO) IsUserSubscribed(ctx context.Context, user models.UserInfo) (*models.UserInfo, error) {
	// Only set stripe.Key from environment if not already set (preserves test mocks)
	if stripe.Key == "" {
		stripe.Key = os.Getenv("STRIPE_SECRET")
		if stripe.Key == "" {
			return nil, fmt.Errorf("missing stripe secret")
		}
	}
	sub, err := d.GetSubscription(ctx, user.Email)
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
			if err := d.UpdateSubscription(ctx, *sub); err != nil {
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

		stories, err := d.GetAllStories(ctx, user.Email)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		for idx, s := range stories {
			if idx > 0 {
				go d.SoftDeleteStory(ctx, user.Email, s.ID, true)
			}
		}
		sub.CurrentSubscriptionEnd = time.Now()
		err = d.UpdateSubscription(ctx, *sub)
		if err != nil {
			return nil, err
		}
		user.Subscriber = false
		err = d.UpdateUser(ctx, user)
		if err != nil {
			return nil, err
		}
	} else if isSubscribed {
		wasSuspended, err := d.CheckForSuspendedStories(ctx, user.Email) // bool
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

func (d *DAO) AddCustomerID(ctx context.Context, email, customerID *string) error {
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
	_, err := d.DynamoClient.UpdateItem(ctx, updateInput)
	if err != nil {
		logger.Error("Failed to add customer ID", "error", err, "email", *email)
		return err
	}
	return nil
}

// sendWelcomeEmail sends a welcome email to a new user
func sendWelcomeEmail(userEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		logger.Error("Unable to send welcome email - missing AWS_REGION environment variable")
		return errors.New("unable to send welcome email due to missing aws region param")
	}

	logger.Debug("Loading AWS config for welcome email",
		"region", region,
		"email", userEmail)

	// Load AWS config with explicit region and default credential chain
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
	)
	if err != nil {
		logger.Error("Failed to load AWS config for welcome email",
			"error", err,
			"region", region,
			"email", userEmail)
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	svc := sesv2.NewFromConfig(cfg)
	logger.Debug("Created SES v2 client for welcome email", "email", userEmail)

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

	_, err = svc.SendEmail(context.Background(), input)
	if err != nil {
		logger.Error("Failed to send welcome email via SES",
			"error", err,
			"email", userEmail,
			"region", region)
		return fmt.Errorf("failed to send welcome email: %w", err)
	}
	logger.Debug("Welcome email sent successfully", "email", userEmail)
	return nil
}

// DeleteUser soft deletes a user account and all associated data
func (d *DAO) DeleteUser(ctx context.Context, email string) error {
	now := strconv.FormatInt(time.Now().Unix(), 10)

	// 1. Cancel Stripe subscription if exists
	sub, err := d.GetSubscription(ctx, email)
	if err == nil && sub.SubscriptionID != "" {
		// Subscription cancellation is handled via Stripe webhook
		// We just mark it for cancellation here
		logger.Info("User has active subscription, will be cancelled", "email", email, "subscriptionID", sub.SubscriptionID)
	}

	// 2. Soft delete all user's stories
	stories, err := d.GetAllStories(ctx, email)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	for _, story := range stories {
		if err := d.SoftDeleteStory(ctx, email, story.ID, false); err != nil {
			return err
		}
	}

	// 3. Soft delete all user's series
	series, err := d.GetAllSeriesWithStories(ctx, email, false)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	for _, s := range series {
		if err := d.DeleteSeries(ctx, email, s); err != nil {
			return err
		}
	}

	// 4. Mark user as deleted
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("set deleted_at=:t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberN{Value: now},
		},
	}

	if _, err := d.DynamoClient.UpdateItem(ctx, input); err != nil {
		return err
	}

	logger.Info("User account deleted", "email", email)
	return nil
}

// sendNewUserNotificationEmail sends an email notification to support when a new user signs up
func sendNewUserNotificationEmail(userEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		logger.Error("Unable to send notification email - missing AWS_REGION environment variable")
		return errors.New("unable to send alert email due to missing aws region param")
	}

	logger.Debug("Loading AWS config for notification email",
		"region", region,
		"userEmail", userEmail)

	// Load AWS config with explicit region and default credential chain
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
	)
	if err != nil {
		logger.Error("Failed to load AWS config for notification email",
			"error", err,
			"region", region,
			"userEmail", userEmail)
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	svc := sesv2.NewFromConfig(cfg)
	logger.Debug("Created SES v2 client for notification email", "userEmail", userEmail)

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

	_, err = svc.SendEmail(context.Background(), input)
	if err != nil {
		logger.Error("Failed to send notification email via SES",
			"error", err,
			"userEmail", userEmail,
			"region", region)
		return fmt.Errorf("failed to send notification email: %w", err)
	}
	logger.Debug("Notification email sent successfully", "userEmail", userEmail)
	return nil
}
