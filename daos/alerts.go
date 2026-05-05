package daos

import (
	"context"
	"fmt"
	"sort"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// AnnouncementSentinel is used as the target_email for announcements since DynamoDB
// GSI keys cannot be empty strings.
const AnnouncementSentinel = "__all__"

func (d *DAO) CreateAlert(ctx context.Context, alert models.Alert) error {
	// Use sentinel value for announcements
	if alert.TargetEmail == "" {
		alert.TargetEmail = AnnouncementSentinel
	}

	logger.Info("Creating alert",
		"alertId", alert.ID,
		"alertType", alert.AlertType,
		"targetEmail", alert.TargetEmail)

	item, err := attributevalue.MarshalMap(alert)
	if err != nil {
		return fmt.Errorf("marshal alert: %w", err)
	}

	_, err = d.DynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String("alerts" + GetTableSuffix()),
		Item:      item,
	})
	if err != nil {
		logger.Error("Failed to create alert",
			"error", err,
			"alertId", alert.ID)
		return err
	}
	logger.Info("Alert created", "alertId", alert.ID)
	return nil
}

func (d *DAO) GetAlertsForUser(ctx context.Context, email string) ([]models.Alert, error) {
	logger.Debug("Getting alerts for user", "email", email)

	// Query personal alerts for this user
	personalOut, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("alerts" + GetTableSuffix()),
		IndexName:              aws.String("target_email-created_at-index"),
		KeyConditionExpression: aws.String("target_email = :email"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("Failed to query personal alerts",
			"error", err,
			"email", email)
		return nil, err
	}

	// Query announcements (target_email = sentinel)
	announcementOut, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("alerts" + GetTableSuffix()),
		IndexName:              aws.String("target_email-created_at-index"),
		KeyConditionExpression: aws.String("target_email = :all"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":all": &types.AttributeValueMemberS{Value: AnnouncementSentinel},
		},
	})
	if err != nil {
		logger.Error("Failed to query announcement alerts",
			"error", err)
		return nil, err
	}

	var alerts []models.Alert
	allItems := append(personalOut.Items, announcementOut.Items...)
	if err := attributevalue.UnmarshalListOfMaps(allItems, &alerts); err != nil {
		return nil, fmt.Errorf("unmarshal alerts: %w", err)
	}

	// Clean up sentinel values and sort by created_at descending
	for i := range alerts {
		if alerts[i].TargetEmail == AnnouncementSentinel {
			alerts[i].TargetEmail = ""
		}
	}
	sort.Slice(alerts, func(i, j int) bool {
		return alerts[i].CreatedAt > alerts[j].CreatedAt
	})

	return alerts, nil
}

func (d *DAO) GetAlertReadsByUser(ctx context.Context, email string) ([]models.AlertRead, error) {
	logger.Debug("Getting alert reads for user", "email", email)

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("alert_reads" + GetTableSuffix()),
		KeyConditionExpression: aws.String("email = :email"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": &types.AttributeValueMemberS{Value: email},
		},
	})
	if err != nil {
		logger.Error("Failed to query alert reads",
			"error", err,
			"email", email)
		return nil, err
	}

	var reads []models.AlertRead
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &reads); err != nil {
		return nil, fmt.Errorf("unmarshal alert reads: %w", err)
	}
	return reads, nil
}

func (d *DAO) MarkAlertRead(ctx context.Context, email string, alertID string) error {
	logger.Info("Marking alert as read",
		"email", email,
		"alertId", alertID)

	read := models.AlertRead{
		Email:   email,
		AlertID: alertID,
		ReadAt:  time.Now().Unix(),
	}

	item, err := attributevalue.MarshalMap(read)
	if err != nil {
		return fmt.Errorf("marshal alert read: %w", err)
	}

	_, err = d.DynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String("alert_reads" + GetTableSuffix()),
		Item:      item,
	})
	if err != nil {
		logger.Error("Failed to mark alert as read",
			"error", err,
			"email", email,
			"alertId", alertID)
		return err
	}
	logger.Info("Alert marked as read",
		"email", email,
		"alertId", alertID)
	return nil
}

func (d *DAO) createWelcomeAlert(ctx context.Context, email string) {
	alert := models.Alert{
		ID:          fmt.Sprintf("welcome-%s", email),
		Subject:     "Welcome to Threadr!",
		Message:     "We're excited to have you. Start by creating your first story and linking your characters, places, and events directly into your manuscript. If you need any help, reach out to support@threadr.net.",
		Link:        "/stories/new",
		AlertType:   models.AlertTypePersonal,
		TargetEmail: email,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	if err := d.CreateAlert(ctx, alert); err != nil {
		logger.Error("Failed to create welcome alert", "error", err, "email", email)
	}
}

func (d *DAO) createSubscribeNowAlert(ctx context.Context, email string) {
	alert := models.Alert{
		ID:          fmt.Sprintf("subscribe-%s", email),
		Subject:     "Subscriber features",
		Message:     "FYI: paid accounts get unlimited associations plus full export capability. Subscribe here!",
		Link:        "/subscribe",
		AlertType:   models.AlertTypePersonal,
		TargetEmail: email,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	if err := d.CreateAlert(ctx, alert); err != nil {
		logger.Error("Failed to create welcome alert", "error", err, "email", email)
	}
}

func (d *DAO) createWelcomeBackAlert(ctx context.Context, email string) {
	alert := models.Alert{
		ID:          fmt.Sprintf("welcome-back-%s-%d", email, time.Now().Unix()),
		Subject:     "Welcome back to Threadr!",
		Message:     "Great to see you again. Your stories have been restored and are ready for you. If you need any help, reach out to support@threadr.net.",
		Link:        "/stories",
		AlertType:   models.AlertTypePersonal,
		TargetEmail: email,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	if err := d.CreateAlert(ctx, alert); err != nil {
		logger.Error("Failed to create welcome back alert", "error", err, "email", email)
	}
}
