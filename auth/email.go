package auth

import (
	"context"
	"errors"
	"log"
	"os"

	awsv2 "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sesv2types "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ses"
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
		FromEmailAddress: awsv2.String("no-reply@docter.io"),
		Destination: &sesv2types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &sesv2types.EmailContent{
			Simple: &sesv2types.Message{
				Subject: &sesv2types.Content{
					Data: awsv2.String("Welcome to RichDocter"),
				},
				Body: &sesv2types.Body{
					Text: &sesv2types.Content{
						Data: awsv2.String("Thank you for signing up for RichDocter. We're excited to have you on board!"),
					},
				},
			},
		},
	}

	result, err := svc.SendEmail(context.TODO(), input)
	if err != nil {
		return err
	}
	log.Printf("Welcome email sent to %s, Message ID: %s\n", toEmail, *result.MessageId)
	return nil
}

func SendAlertEmail(userEmail string) error {

	region := os.Getenv("AWS_REGION")
	if region == "" {
		return errors.New("unable to send alert email due to missing aws region param")
	}

	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(region),
	})
	if err != nil {
		return err
	}

	svc := ses.New(sess)

	// Set up the email parameters.
	input := &ses.SendEmailInput{
		Source: aws.String("no-reply@docter.io"), // Verified email in SES
		Destination: &ses.Destination{
			ToAddresses: []*string{
				aws.String("support@docter.io"),
			},
		},
		Message: &ses.Message{
			Subject: &ses.Content{
				Data: aws.String("New User Signup"),
			},
			Body: &ses.Body{
				Text: &ses.Content{
					Data: aws.String("A new user has signed up for docter: " + userEmail),
				},
			},
		},
	}

	// Send the email.
	_, err = svc.SendEmail(input)
	if err != nil {
		return err
	}
	return nil
}
