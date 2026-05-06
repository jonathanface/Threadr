package email

import (
	"context"
	"fmt"
	"os"
	"strings"

	"Threadr/logger"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sesv2types "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

const (
	fromAddress    = "no-reply@threadr.net"
	supportAddress = "support@threadr.net"
)

// sanitizeEmailField strips newlines and control characters from user-provided
// values before they are interpolated into email subjects or bodies.
func sanitizeEmailField(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > 256 { //nolint:mnd
		s = s[:256]
	}
	return s
}

// sendBasicEmail centralises the SES v2 plumbing shared by every transactional
// email sender: AWS region check, config load, request build, send + log. The
// `kind` label is interpolated into log messages and the missing-region error.
// Extra log key/value pairs (e.g. additional context fields) can be supplied
// via logFields.
func sendBasicEmail(toEmail, subject, body, kind string, logFields ...any) error {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return fmt.Errorf("unable to send %s email due to missing aws region param", kind)
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return err
	}

	svc := sesv2.NewFromConfig(cfg)
	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(fromAddress),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{Data: aws.String(subject)},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{Data: aws.String(body)},
				},
			},
		},
	}

	sendArgs := append([]any{"to", toEmail}, logFields...)
	logger.Info("Sending "+kind+" email", sendArgs...)
	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		errArgs := append([]any{"error", err, "to", toEmail}, logFields...)
		logger.Error("Failed to send "+kind+" email", errArgs...)
		return err
	}
	logger.Info(kind+" email sent", "to", toEmail, "messageId", *result.MessageId)
	return nil
}

func SendWelcomeEmail(toEmail string) error {
	return sendBasicEmail(
		toEmail,
		"Welcome to RichThreadr",
		"Thank you for signing up for RichThreadr. We're excited to have you on board!",
		"welcome",
	)
}

func SendShareInviteEmail(toEmail, readerFirstName, authorName, authorEmail, storyTitle, shareURL string) error {
	safeTitle := sanitizeEmailField(storyTitle)
	safeName := sanitizeEmailField(readerFirstName)
	safeAuthor := sanitizeEmailField(authorName)
	safeAuthorEmail := sanitizeEmailField(authorEmail)

	subject := "You've been invited to read \"" + safeTitle + "\" on Threadr"
	body := "Hi " + safeName + ",\n\n" +
		safeAuthor + " (" + safeAuthorEmail + ") has invited you to read \"" + safeTitle + "\" on Threadr.\n\n" +
		"Click the link below to start reading:\n" + shareURL + "\n\n" +
		"Happy reading!"

	return sendBasicEmail(toEmail, subject, body, "share invite",
		"author", authorName, "authorEmail", authorEmail, "storyTitle", storyTitle)
}

// SendAlertEmail notifies the support inbox when a new user signs up.
func SendAlertEmail(userEmail string) error {
	return sendBasicEmail(
		supportAddress,
		"New User Signup",
		"A new user has signed up for docter: "+userEmail,
		"alert",
		"userEmail", userEmail,
	)
}

func SendVerificationEmail(toEmail, verifyURL string) error {
	subject := "Verify your Threadr account"
	body := "Welcome to Threadr!\n\n" +
		"Click the link below to verify your email address:\n" + verifyURL + "\n\n" +
		"This link expires in 24 hours.\n\n" +
		"If you didn't create this account, you can safely ignore this email."
	return sendBasicEmail(toEmail, subject, body, "verification")
}

func SendPasswordResetEmail(toEmail, resetURL string) error {
	subject := "Reset your Threadr password"
	body := "We received a request to reset your password.\n\n" +
		"Click the link below to set a new password:\n" + resetURL + "\n\n" +
		"This link expires in 1 hour.\n\n" +
		"If you didn't request this, you can safely ignore this email."
	return sendBasicEmail(toEmail, subject, body, "password reset")
}
