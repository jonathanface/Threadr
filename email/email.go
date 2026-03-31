package email

import (
	"RichDocter/logger"
	"context"
	"errors"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sesv2types "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

func SendWelcomeEmail(toEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send welcome email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String("Welcome to RichDocter"),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String("Thank you for signing up for RichDocter. We're excited to have you on board!"),
					},
				},
			},
		},
	}

	logger.Info("Sending welcome email", "to", toEmail)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		logger.Error("Failed to send welcome email", "error", err, "to", toEmail)
		return err
	}
	logger.Info("Welcome email sent",
		"to", toEmail,
		"messageId", *result.MessageId)
	return nil
}

func SendShareInviteEmail(toEmail, readerFirstName, authorName, authorEmail, storyTitle, shareURL string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send invite email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	subject := "You've been invited to read \"" + storyTitle + "\" on Docter"
	body := "Hi " + readerFirstName + ",\n\n" +
		authorName + " (" + authorEmail + ") has invited you to read \"" + storyTitle + "\" on Docter.\n\n" +
		"Click the link below to start reading:\n" + shareURL + "\n\n" +
		"Happy reading!"

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String(subject),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String(body),
					},
				},
			},
		},
	}

	logger.Info("Sending share invite email",
		"to", toEmail,
		"author", authorName,
		"authorEmail", authorEmail,
		"storyTitle", storyTitle)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		logger.Error("Failed to send share invite email",
			"error", err,
			"to", toEmail,
			"author", authorName,
			"storyTitle", storyTitle)
		return err
	}
	logger.Info("Share invite email sent",
		"to", toEmail,
		"messageId", *result.MessageId)
	return nil
}

func SendAlertEmail(userEmail string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send alert email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

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
						Data: aws.String("A new user has signed up for docter: " + userEmail),
					},
				},
			},
		},
	}

	logger.Info("Sending alert email", "userEmail", userEmail)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		logger.Error("Failed to send alert email", "error", err, "userEmail", userEmail)
		return err
	}
	logger.Info("Alert email sent",
		"userEmail", userEmail,
		"messageId", *result.MessageId)
	return nil
}

func SendVerificationEmail(toEmail, verifyURL string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send verification email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	subject := "Verify your Docter account"
	body := "Welcome to Docter!\n\n" +
		"Click the link below to verify your email address:\n" + verifyURL + "\n\n" +
		"This link expires in 24 hours.\n\n" +
		"If you didn't create this account, you can safely ignore this email."

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String(subject),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String(body),
					},
				},
			},
		},
	}

	logger.Info("Sending verification email", "to", toEmail)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		logger.Error("Failed to send verification email", "error", err, "to", toEmail)
		return err
	}
	logger.Info("Verification email sent",
		"to", toEmail,
		"messageId", *result.MessageId)
	return nil
}

func SendPasswordResetEmail(toEmail, resetURL string) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send password reset email due to missing aws region param")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)

	subject := "Reset your Docter password"
	body := "We received a request to reset your password.\n\n" +
		"Click the link below to set a new password:\n" + resetURL + "\n\n" +
		"This link expires in 1 hour.\n\n" +
		"If you didn't request this, you can safely ignore this email."

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: aws.String(subject),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: aws.String(body),
					},
				},
			},
		},
	}

	logger.Info("Sending password reset email", "to", toEmail)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		logger.Error("Failed to send password reset email", "error", err, "to", toEmail)
		return err
	}
	logger.Info("Password reset email sent",
		"to", toEmail,
		"messageId", *result.MessageId)
	return nil
}
