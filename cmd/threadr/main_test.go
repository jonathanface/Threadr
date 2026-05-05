package main

import (
	"os"
	"testing"
)

// Tests for normalizeAddr.
func TestNormalizeAddr(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string defaults to :8080",
			input:    "",
			expected: ":8080",
		},
		{
			name:     "port without colon gets colon prepended",
			input:    "3000",
			expected: ":3000",
		},
		{
			name:     "port with colon stays unchanged",
			input:    ":8080",
			expected: ":8080",
		},
		{
			name:     "numeric only port",
			input:    "80",
			expected: ":80",
		},
		{
			name:     "port with leading colon",
			input:    ":9000",
			expected: ":9000",
		},
		{
			name:     "localhost with port",
			input:    "localhost:8080",
			expected: ":localhost:8080",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := normalizeAddr(tt.input)
			if result != tt.expected {
				t.Errorf("normalizeAddr(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// Tests for getenv.
func TestGetenv(t *testing.T) {
	tests := []struct {
		name     string
		envKey   string
		envValue string
		defValue string
		expected string
		setup    func(t *testing.T)
	}{
		{
			name:     "env var not set returns default",
			envKey:   "TEST_UNSET_VAR_CMD",
			defValue: "default-value",
			expected: "default-value",
			setup: func(t *testing.T) {
				os.Unsetenv("TEST_UNSET_VAR_CMD")
			},
		},
		{
			name:     "env var set returns env value",
			envKey:   "TEST_SET_VAR_CMD",
			envValue: "env-value",
			defValue: "default-value",
			expected: "env-value",
			setup: func(t *testing.T) {
				t.Setenv("TEST_SET_VAR_CMD", "env-value")
			},
		},
		{
			name:     "empty env var returns default",
			envKey:   "TEST_EMPTY_VAR_CMD",
			envValue: "",
			defValue: "default-value",
			expected: "default-value",
			setup: func(t *testing.T) {
				t.Setenv("TEST_EMPTY_VAR_CMD", "")
			},
		},
		{
			name:     "env var with spaces is preserved",
			envKey:   "TEST_SPACES_VAR_CMD",
			envValue: "  value with spaces  ",
			defValue: "default",
			expected: "  value with spaces  ",
			setup: func(t *testing.T) {
				t.Setenv("TEST_SPACES_VAR_CMD", "  value with spaces  ")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setup != nil {
				tt.setup(t)
			}

			result := getenv(tt.envKey, tt.defValue)
			if result != tt.expected {
				t.Errorf("getenv(%q, %q) = %q, want %q", tt.envKey, tt.defValue, result, tt.expected)
			}
		})
	}
}

// Tests for atoiDefault.
func TestAtoiDefault(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		defValue int
		expected int
	}{
		{
			name:     "empty string returns default",
			input:    "",
			defValue: 42,
			expected: 42,
		},
		{
			name:     "valid number string returns parsed value",
			input:    "100",
			defValue: 42,
			expected: 100,
		},
		{
			name:     "zero string returns zero",
			input:    "0",
			defValue: 42,
			expected: 0,
		},
		{
			name:     "negative number string",
			input:    "-5",
			defValue: 42,
			expected: -5,
		},
		{
			name:     "invalid string returns default",
			input:    "not-a-number",
			defValue: 99,
			expected: 99,
		},
		{
			name:     "string with spaces returns default",
			input:    " 123 ",
			defValue: 10,
			expected: 10,
		},
		{
			name:     "float string returns default",
			input:    "3.14",
			defValue: 20,
			expected: 20,
		},
		{
			name:     "large number",
			input:    "999999",
			defValue: 1,
			expected: 999999,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := atoiDefault(tt.input, tt.defValue)
			if result != tt.expected {
				t.Errorf("atoiDefault(%q, %d) = %d, want %d", tt.input, tt.defValue, result, tt.expected)
			}
		})
	}
}
