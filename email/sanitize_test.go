package email

import (
	"strings"
	"testing"
)

func TestSanitizeEmailField(t *testing.T) {
	t.Run("strips newlines", func(t *testing.T) {
		result := sanitizeEmailField("Hello\nWorld")
		if strings.Contains(result, "\n") {
			t.Errorf("Expected newlines stripped, got: %q", result)
		}
		if result != "Hello World" {
			t.Errorf("Expected 'Hello World', got: %q", result)
		}
	})

	t.Run("strips carriage returns", func(t *testing.T) {
		result := sanitizeEmailField("Hello\r\nWorld")
		if strings.Contains(result, "\r") {
			t.Errorf("Expected carriage returns stripped, got: %q", result)
		}
	})

	t.Run("truncates long strings to 256 chars", func(t *testing.T) {
		long := strings.Repeat("A", 500)
		result := sanitizeEmailField(long)
		if len(result) != 256 {
			t.Errorf("Expected 256 chars, got %d", len(result))
		}
	})

	t.Run("passes through normal strings", func(t *testing.T) {
		result := sanitizeEmailField("John Doe")
		if result != "John Doe" {
			t.Errorf("Expected 'John Doe', got: %q", result)
		}
	})

	t.Run("handles empty string", func(t *testing.T) {
		result := sanitizeEmailField("")
		if result != "" {
			t.Errorf("Expected empty string, got: %q", result)
		}
	})

	t.Run("strips email header injection attempt", func(t *testing.T) {
		result := sanitizeEmailField("attacker@evil.com\nBcc: victim@test.com")
		if strings.Contains(result, "\n") {
			t.Errorf("Header injection not prevented: %q", result)
		}
	})
}
