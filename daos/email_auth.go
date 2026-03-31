package daos

import (
	"RichDocter/logger"
	"RichDocter/models"
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) CreateEmailUser(ctx context.Context, email, firstName, lastName, passwordHash, verificationToken string, tokenExpires int64) (*models.UserInfo, error) {
	logger.Info("Creating email user", "email", email)

	now := strconv.FormatInt(time.Now().Unix(), 10)

	// Use UpdateItem so it works for both new accounts and reactivating soft-deleted accounts
	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String(
			"SET first_name = :fn, last_name = :ln, auth_type = :at, password_hash = :ph, " +
				"email_verified = :ev, verification_token = :vt, verification_token_expires = :vte, " +
				"admin = if_not_exists(admin, :adm), subscriber = if_not_exists(subscriber, :sub), " +
				"created_at = :now " +
				"REMOVE deleted_at, reset_token, reset_token_expires"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":fn":  &types.AttributeValueMemberS{Value: firstName},
			":ln":  &types.AttributeValueMemberS{Value: lastName},
			":at":  &types.AttributeValueMemberS{Value: "email"},
			":ph":  &types.AttributeValueMemberS{Value: passwordHash},
			":ev":  &types.AttributeValueMemberBOOL{Value: false},
			":vt":  &types.AttributeValueMemberS{Value: verificationToken},
			":vte": &types.AttributeValueMemberN{Value: strconv.FormatInt(tokenExpires, 10)},
			":adm": &types.AttributeValueMemberBOOL{Value: false},
			":sub": &types.AttributeValueMemberBOOL{Value: false},
			":now": &types.AttributeValueMemberN{Value: now},
		},
	})
	if err != nil {
		logger.Error("Failed to create email user", "error", err, "email", email)
		return nil, err
	}

	logger.Info("Email user created", "email", email)

	// NOTE: Data restoration (stories/series) happens after email verification,
	// not during signup, to prevent attackers from accessing a deleted user's data
	// by signing up with their email.

	return &models.UserInfo{
		Email:         email,
		FirstName:     firstName,
		LastName:      lastName,
		AuthType:      "email",
		EmailVerified: false,
		NewUser:       true,
	}, nil
}

func (d *DAO) SetEmailVerified(ctx context.Context, email string) error {
	logger.Info("Setting email verified", "email", email)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET email_verified = :v REMOVE verification_token, verification_token_expires"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":v": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		logger.Error("Failed to set email verified", "error", err, "email", email)
		return err
	}
	logger.Info("Email verified", "email", email)
	return nil
}

func (d *DAO) SetVerificationToken(ctx context.Context, email, token string, expires int64) error {
	logger.Info("Setting verification token", "email", email)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET verification_token = :t, verification_token_expires = :e"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberS{Value: token},
			":e": &types.AttributeValueMemberN{Value: strconv.FormatInt(expires, 10)},
		},
	})
	if err != nil {
		logger.Error("Failed to set verification token", "error", err, "email", email)
		return err
	}
	return nil
}

func (d *DAO) SetResetToken(ctx context.Context, email, token string, expires int64) error {
	logger.Info("Setting reset token", "email", email)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET reset_token = :t, reset_token_expires = :e"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberS{Value: token},
			":e": &types.AttributeValueMemberN{Value: strconv.FormatInt(expires, 10)},
		},
	})
	if err != nil {
		logger.Error("Failed to set reset token", "error", err, "email", email)
		return err
	}
	return nil
}

func (d *DAO) UpdatePassword(ctx context.Context, email, passwordHash string) error {
	logger.Info("Updating password", "email", email)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET password_hash = :h REMOVE reset_token, reset_token_expires"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":h": &types.AttributeValueMemberS{Value: passwordHash},
		},
	})
	if err != nil {
		logger.Error("Failed to update password", "error", err, "email", email)
		return err
	}
	logger.Info("Password updated", "email", email)
	return nil
}

func (d *DAO) ClearResetToken(ctx context.Context, email string) error {
	logger.Info("Clearing reset token", "email", email)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("REMOVE reset_token, reset_token_expires"),
	})
	if err != nil {
		logger.Error("Failed to clear reset token", "error", err, "email", email)
		return err
	}
	return nil
}

func (d *DAO) LinkOAuthAccount(ctx context.Context, email, authType string) error {
	logger.Info("Linking OAuth account", "email", email, "authType", authType)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("users" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"email": &types.AttributeValueMemberS{Value: email},
		},
		UpdateExpression: aws.String("SET auth_type = :a, email_verified = :v REMOVE password_hash, verification_token, verification_token_expires, reset_token, reset_token_expires"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":a": &types.AttributeValueMemberS{Value: authType},
			":v": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		logger.Error("Failed to link OAuth account", "error", err, "email", email)
		return err
	}
	logger.Info("OAuth account linked", "email", email, "authType", authType)
	return nil
}

// RestoreDataForVerifiedUser restores soft-deleted stories and series for a reclaimed account.
// Called after email verification to ensure only the legitimate owner gets their data back.
func (d *DAO) RestoreDataForVerifiedUser(email string) {
	bgCtx := context.Background()

	stories, err := d.GetAllStoriesIncludingDeleted(bgCtx, email)
	if err == nil {
		for _, story := range stories {
			if err := d.RestoreStory(bgCtx, email, story.ID); err != nil {
				logger.Warn("Failed to restore story for verified account", "email", email, "storyID", story.ID, "error", err)
			}
		}
		if len(stories) > 0 {
			logger.Info("Restored stories for verified email account", "email", email, "count", len(stories))
		}
	}

	series, err := d.GetAllSeriesIncludingDeleted(bgCtx, email)
	if err == nil {
		for _, s := range series {
			if err := d.RestoreSeries(bgCtx, email, s.ID); err != nil {
				logger.Warn("Failed to restore series for verified account", "email", email, "seriesID", s.ID, "error", err)
			}
		}
		if len(series) > 0 {
			logger.Info("Restored series for verified email account", "email", email, "count", len(series))
		}
	}
}

// FindUserByVerificationToken scans for a user with the given verification token.
// This is acceptable because email verification is infrequent.
func (d *DAO) FindUserByVerificationToken(ctx context.Context, token string) (*models.UserInfo, error) {
	logger.Debug("Finding user by verification token")

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		FilterExpression: aws.String("verification_token = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberS{Value: token},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("scan for verification token: %w", err)
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("verification token not found")
	}

	var user models.UserInfo
	if err := attributevalue.UnmarshalMap(out.Items[0], &user); err != nil {
		return nil, fmt.Errorf("unmarshal user: %w", err)
	}
	return &user, nil
}

// FindUserByResetToken scans for a user with the given reset token.
func (d *DAO) FindUserByResetToken(ctx context.Context, token string) (*models.UserInfo, error) {
	logger.Debug("Finding user by reset token")

	out, err := d.DynamoClient.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String("users" + GetTableSuffix()),
		FilterExpression: aws.String("reset_token = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberS{Value: token},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("scan for reset token: %w", err)
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("reset token not found")
	}

	var user models.UserInfo
	if err := attributevalue.UnmarshalMap(out.Items[0], &user); err != nil {
		return nil, fmt.Errorf("unmarshal user: %w", err)
	}
	return &user, nil
}
