package auth

import (
	"log"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ses"
)

func sendWelcomeEmail(toEmail string) error {

	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-east-1"), // Change as needed
	})

	svc := ses.New(sess)

	// Set up the email parameters.
	input := &ses.SendEmailInput{
		Source: aws.String("no-reply@docter.io"), // Verified email in SES
		Destination: &ses.Destination{
			ToAddresses: []*string{
				aws.String(toEmail),
			},
		},
		Message: &ses.Message{
			Subject: &ses.Content{
				Data: aws.String("Welcome to RichDocter"),
			},
			Body: &ses.Body{
				Text: &ses.Content{
					Data: aws.String("Thank you for signing up for RichDocter. We're excited to have you on board!"),
				},
			},
		},
	}

	// Send the email.
	result, err := svc.SendEmail(input)
	if err != nil {
		return err
	}
	log.Printf("Email sent to %s, Message ID: %s\n", toEmail, *result.MessageId)
	return nil
}

func sendAlertEmail(userEmail string) error {

	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-east-1"), // Change as needed
	})

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
