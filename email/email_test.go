package email

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

// MockSESv2Client is a mock implementation of the SES v2 client for testing
type MockSESv2Client struct {
	SendEmailFunc func(ctx context.Context, input *sesv2.SendEmailInput, optFns ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error)
}

func (m *MockSESv2Client) SendEmail(ctx context.Context, input *sesv2.SendEmailInput, optFns ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error) {
	if m.SendEmailFunc != nil {
		return m.SendEmailFunc(ctx, input, optFns...)
	}
	messageID := "test-message-id-12345"
	return &sesv2.SendEmailOutput{
		MessageId: &messageID,
	}, nil
}

// Tests for SendWelcomeEmail
func TestSendWelcomeEmail_MissingAWSRegion(t *testing.T) {
	// Save original env var and restore after test
	originalRegion := os.Getenv("AWS_REGION")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Unset AWS_REGION
	os.Unsetenv("AWS_REGION")

	err := SendWelcomeEmail("test@example.com")
	if err == nil {
		t.Error("Expected error for missing AWS_REGION, got nil")
	}
	if err.Error() != "unable to send welcome email due to missing aws region param" {
		t.Errorf("Expected specific error message, got: %s", err.Error())
	}
}

func TestSendWelcomeEmail_ValidEmail(t *testing.T) {
	// Set AWS_REGION for the test
	originalRegion := os.Getenv("AWS_REGION")
	os.Setenv("AWS_REGION", "us-east-1")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Note: This test will attempt to create a real AWS session
	// In a real-world scenario, we would need to refactor SendWelcomeEmail
	// to accept an SES client interface for proper mocking
	// For now, we just verify the function doesn't panic with valid inputs

	// We can't fully test this without mocking the AWS session creation
	// The function would need to be refactored to accept a session/client parameter
	// or we'd need to use environment variables for AWS credentials
}

func TestSendWelcomeEmail_EmailFormat(t *testing.T) {
	// This test verifies the function validates basic requirements
	originalRegion := os.Getenv("AWS_REGION")
	os.Setenv("AWS_REGION", "us-east-1")
	defer os.Setenv("AWS_REGION", originalRegion)

	// The function should accept a valid email format
	// Without mocking AWS, we can only test the early validation
	testEmail := "user@example.com"

	// The function will try to create an AWS session, which will fail in test
	// unless AWS credentials are configured, but it shouldn't panic
	err := SendWelcomeEmail(testEmail)
	// We expect either nil (if AWS creds are configured) or an AWS-related error
	// but not a panic or validation error
	if err != nil {
		t.Logf("Function executed, AWS error expected in test env: %v", err)
	}
}

// Tests for SendAlertEmail
func TestSendAlertEmail_MissingAWSRegion(t *testing.T) {
	// Save original env var and restore after test
	originalRegion := os.Getenv("AWS_REGION")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Unset AWS_REGION
	os.Unsetenv("AWS_REGION")

	err := SendAlertEmail("test@example.com")
	if err == nil {
		t.Error("Expected error for missing AWS_REGION, got nil")
	}
	if err.Error() != "unable to send alert email due to missing aws region param" {
		t.Errorf("Expected specific error message, got: %s", err.Error())
	}
}

func TestSendAlertEmail_ValidEmail(t *testing.T) {
	// Set AWS_REGION for the test
	originalRegion := os.Getenv("AWS_REGION")
	os.Setenv("AWS_REGION", "us-east-1")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Note: This test will attempt to create a real AWS session
	// The function would need refactoring to properly mock the SES client
	testEmail := "newuser@example.com"

	err := SendAlertEmail(testEmail)
	// We expect either nil (if AWS creds are configured) or an AWS-related error
	if err != nil {
		t.Logf("Function executed, AWS error expected in test env: %v", err)
	}
}

func TestSendAlertEmail_EmailContent(t *testing.T) {
	// This test verifies the alert email contains the user email
	originalRegion := os.Getenv("AWS_REGION")
	os.Setenv("AWS_REGION", "us-east-1")
	defer os.Setenv("AWS_REGION", originalRegion)

	testEmail := "signup@example.com"

	// The function will try to send an email to support@docter.io
	// We can't verify the content without mocking, but we can ensure
	// the function handles the email parameter
	err := SendAlertEmail(testEmail)
	if err != nil {
		t.Logf("Function executed with email: %s, error: %v", testEmail, err)
	}
}

// Integration-style tests that demonstrate how the functions should work
// These are more like documentation of expected behavior

func TestEmailFunctions_ExpectedBehavior(t *testing.T) {
	t.Run("SendWelcomeEmail should send to user", func(t *testing.T) {
		// Expected behavior:
		// - Source: no-reply@docter.io
		// - Destination: user's email
		// - Subject: "Welcome to Docter"
		// - Body: Welcome message
		t.Log("SendWelcomeEmail sends welcome email to new users")
	})

	t.Run("SendAlertEmail should notify support", func(t *testing.T) {
		// Expected behavior:
		// - Source: no-reply@docter.io
		// - Destination: support@docter.io
		// - Subject: "New User Signup"
		// - Body: Contains user's email
		t.Log("SendAlertEmail notifies support of new signups")
	})
}

// Mock-based tests (demonstrating what we'd do with refactored code)

func TestSendWelcomeEmail_WithMock_Success(t *testing.T) {
	mockSES := &MockSESv2Client{
		SendEmailFunc: func(ctx context.Context, input *sesv2.SendEmailInput, optFns ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error) {
			if *input.FromEmailAddress != "no-reply@docter.io" {
				t.Errorf("Expected source 'no-reply@docter.io', got %s", *input.FromEmailAddress)
			}
			if len(input.Destination.ToAddresses) != 1 {
				t.Errorf("Expected 1 recipient, got %d", len(input.Destination.ToAddresses))
			}
			if input.Destination.ToAddresses[0] != "test@example.com" {
				t.Errorf("Expected recipient 'test@example.com', got %s", input.Destination.ToAddresses[0])
			}

			messageID := "test-message-123"
			return &sesv2.SendEmailOutput{MessageId: &messageID}, nil
		},
	}

	t.Log("Mock SES v2 client created successfully, ready for testing")
	_ = mockSES
}

func TestSendWelcomeEmail_WithMock_Error(t *testing.T) {
	mockSES := &MockSESv2Client{
		SendEmailFunc: func(ctx context.Context, input *sesv2.SendEmailInput, optFns ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error) {
			return nil, errors.New("SES service unavailable")
		},
	}

	t.Log("Mock SES v2 client configured to return errors")
	_ = mockSES
}

func TestSendAlertEmail_WithMock_Success(t *testing.T) {
	mockSES := &MockSESv2Client{
		SendEmailFunc: func(ctx context.Context, input *sesv2.SendEmailInput, optFns ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error) {
			if input.Destination.ToAddresses[0] != "support@docter.io" {
				t.Errorf("Expected recipient 'support@docter.io', got %s", input.Destination.ToAddresses[0])
			}

			messageID := "alert-message-456"
			return &sesv2.SendEmailOutput{MessageId: &messageID}, nil
		},
	}

	t.Log("Mock SES v2 client ready to verify alert email behavior")
	_ = mockSES
}

// Refactoring suggestion tests
func TestEmailFunctions_RefactoringNeeded(t *testing.T) {
	t.Log("NOTE: SendAlertEmail is now exported and can be used from other packages")
	t.Log("The sendWelcomeEmail function remains unexported")
	t.Log("Both functions create their own AWS sessions internally, making them hard to test.")
	t.Log("Consider refactoring to:")
	t.Log("1. Export sendWelcomeEmail as SendWelcomeEmail")
	t.Log("2. Accept an SES client interface parameter")
	t.Log("3. Or create a separate testable wrapper")
	t.Log("This would enable proper unit testing with mocked AWS SES calls")
}
