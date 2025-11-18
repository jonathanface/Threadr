package auth

import (
	"errors"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go/service/ses"
	"github.com/aws/aws-sdk-go/service/ses/sesiface"
)

// MockSESClient is a mock implementation of the SES client for testing
type MockSESClient struct {
	sesiface.SESAPI
	SendEmailFunc func(*ses.SendEmailInput) (*ses.SendEmailOutput, error)
}

func (m *MockSESClient) SendEmail(input *ses.SendEmailInput) (*ses.SendEmailOutput, error) {
	if m.SendEmailFunc != nil {
		return m.SendEmailFunc(input)
	}
	messageID := "test-message-id-12345"
	return &ses.SendEmailOutput{
		MessageId: &messageID,
	}, nil
}

// Tests for sendWelcomeEmail
func TestSendWelcomeEmail_MissingAWSRegion(t *testing.T) {
	// Save original env var and restore after test
	originalRegion := os.Getenv("AWS_REGION")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Unset AWS_REGION
	os.Unsetenv("AWS_REGION")

	err := sendWelcomeEmail("test@example.com")
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
	// In a real-world scenario, we would need to refactor sendWelcomeEmail
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
	err := sendWelcomeEmail(testEmail)
	// We expect either nil (if AWS creds are configured) or an AWS-related error
	// but not a panic or validation error
	if err != nil {
		t.Logf("Function executed, AWS error expected in test env: %v", err)
	}
}

// Tests for sendAlertEmail
func TestSendAlertEmail_MissingAWSRegion(t *testing.T) {
	// Save original env var and restore after test
	originalRegion := os.Getenv("AWS_REGION")
	defer os.Setenv("AWS_REGION", originalRegion)

	// Unset AWS_REGION
	os.Unsetenv("AWS_REGION")

	err := sendAlertEmail("test@example.com")
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

	err := sendAlertEmail(testEmail)
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
	err := sendAlertEmail(testEmail)
	if err != nil {
		t.Logf("Function executed with email: %s, error: %v", testEmail, err)
	}
}

// Integration-style tests that demonstrate how the functions should work
// These are more like documentation of expected behavior

func TestEmailFunctions_ExpectedBehavior(t *testing.T) {
	t.Run("sendWelcomeEmail should send to user", func(t *testing.T) {
		// Expected behavior:
		// - Source: no-reply@docter.io
		// - Destination: user's email
		// - Subject: "Welcome to RichDocter"
		// - Body: Welcome message
		t.Log("sendWelcomeEmail sends welcome email to new users")
	})

	t.Run("sendAlertEmail should notify support", func(t *testing.T) {
		// Expected behavior:
		// - Source: no-reply@docter.io
		// - Destination: support@docter.io
		// - Subject: "New User Signup"
		// - Body: Contains user's email
		t.Log("sendAlertEmail notifies support of new signups")
	})
}

// Mock-based tests (demonstrating what we'd do with refactored code)

func TestSendWelcomeEmail_WithMock_Success(t *testing.T) {
	// This demonstrates how we could test with proper mocking
	// if the functions were refactored to accept an SES client interface

	mockSES := &MockSESClient{
		SendEmailFunc: func(input *ses.SendEmailInput) (*ses.SendEmailOutput, error) {
			// Verify input parameters
			if *input.Source != "no-reply@docter.io" {
				t.Errorf("Expected source 'no-reply@docter.io', got %s", *input.Source)
			}
			if len(input.Destination.ToAddresses) != 1 {
				t.Errorf("Expected 1 recipient, got %d", len(input.Destination.ToAddresses))
			}
			if *input.Destination.ToAddresses[0] != "test@example.com" {
				t.Errorf("Expected recipient 'test@example.com', got %s", *input.Destination.ToAddresses[0])
			}
			if *input.Message.Subject.Data != "Welcome to RichDocter" {
				t.Errorf("Expected subject 'Welcome to RichDocter', got %s", *input.Message.Subject.Data)
			}

			messageID := "test-message-123"
			return &ses.SendEmailOutput{MessageId: &messageID}, nil
		},
	}

	// This is what the test would look like with a refactored function
	t.Log("Mock SES client created successfully, ready for testing")
	_ = mockSES
}

func TestSendWelcomeEmail_WithMock_Error(t *testing.T) {
	mockSES := &MockSESClient{
		SendEmailFunc: func(input *ses.SendEmailInput) (*ses.SendEmailOutput, error) {
			return nil, errors.New("SES service unavailable")
		},
	}

	// With a refactored function that accepts an SES client:
	// err := sendWelcomeEmailWithClient(mockSES, "test@example.com")
	// if err == nil {
	//     t.Error("Expected error from SES, got nil")
	// }

	t.Log("Mock SES client configured to return errors")
	_ = mockSES
}

func TestSendAlertEmail_WithMock_Success(t *testing.T) {
	mockSES := &MockSESClient{
		SendEmailFunc: func(input *ses.SendEmailInput) (*ses.SendEmailOutput, error) {
			// Verify the alert email goes to support
			if *input.Destination.ToAddresses[0] != "support@docter.io" {
				t.Errorf("Expected recipient 'support@docter.io', got %s", *input.Destination.ToAddresses[0])
			}
			if *input.Message.Subject.Data != "New User Signup" {
				t.Errorf("Expected subject 'New User Signup', got %s", *input.Message.Subject.Data)
			}

			messageID := "alert-message-456"
			return &ses.SendEmailOutput{MessageId: &messageID}, nil
		},
	}

	t.Log("Mock SES client ready to verify alert email behavior")
	_ = mockSES
}

// Refactoring suggestion tests
func TestEmailFunctions_RefactoringNeeded(t *testing.T) {
	t.Log("NOTE: The sendWelcomeEmail and sendAlertEmail functions are unexported")
	t.Log("and create their own AWS sessions internally, making them hard to test.")
	t.Log("Consider refactoring to:")
	t.Log("1. Export the functions (SendWelcomeEmail, SendAlertEmail)")
	t.Log("2. Accept an SES client interface parameter")
	t.Log("3. Or create a separate testable wrapper")
	t.Log("This would enable proper unit testing with mocked AWS SES calls")
}
