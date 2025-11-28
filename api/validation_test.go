package api

import (
	"strings"
	"testing"
)

func TestValidateStoryTitle(t *testing.T) {
	testCases := []struct {
		name      string
		title     string
		wantError bool
		errorMsg  string
	}{
		{
			name:      "Valid title",
			title:     "My Story Title",
			wantError: false,
		},
		{
			name:      "Empty title",
			title:     "",
			wantError: true,
			errorMsg:  "Story title is required",
		},
		{
			name:      "Whitespace only title",
			title:     "   ",
			wantError: true,
			errorMsg:  "Story title is required",
		},
		{
			name:      "Title too long",
			title:     strings.Repeat("a", 257),
			wantError: true,
			errorMsg:  "Title is too long",
		},
		{
			name:      "Title at max length",
			title:     strings.Repeat("a", 256),
			wantError: false,
		},
		{
			name:      "Title starts with aws:",
			title:     "aws:MyStory",
			wantError: true,
			errorMsg:  "Title cannot start with",
		},
		{
			name:      "Title starts with AWS: (uppercase)",
			title:     "AWS:MyStory",
			wantError: true,
			errorMsg:  "Title cannot start with",
		},
		{
			name:      "Title contains aws: in middle",
			title:     "My aws: Story",
			wantError: false,
		},
		{
			name:      "Title with allowed special characters",
			title:     "Story: Chapter 1 - The Beginning + More @ Home",
			wantError: false,
		},
		{
			name:      "Title with parentheses (not allowed)",
			title:     "Story (Part 2)",
			wantError: true,
			errorMsg:  "may only contain",
		},
		{
			name:      "Title with invalid characters",
			title:     "Story<script>alert('xss')</script>",
			wantError: true,
			errorMsg:  "may only contain",
		},
		{
			name:      "Title with unicode characters",
			title:     "My Story 日本語",
			wantError: true,
			errorMsg:  "may only contain",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateStoryTitle(tc.title)

			if tc.wantError {
				if err == nil {
					t.Errorf("Expected error but got none")
				} else if !strings.Contains(err.Message, tc.errorMsg) {
					t.Errorf("Error message %q does not contain %q", err.Message, tc.errorMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %s", err.Message)
				}
			}
		})
	}
}

func TestValidateStoryDescription(t *testing.T) {
	testCases := []struct {
		name        string
		description string
		wantError   bool
		errorMsg    string
	}{
		{
			name:        "Valid description",
			description: "A thrilling adventure story",
			wantError:   false,
		},
		{
			name:        "Empty description",
			description: "",
			wantError:   true,
			errorMsg:    "description is required",
		},
		{
			name:        "Whitespace only description",
			description: "   ",
			wantError:   true,
			errorMsg:    "description is required",
		},
		{
			name:        "Description too long",
			description: strings.Repeat("a", 5001),
			wantError:   true,
			errorMsg:    "Description is too long",
		},
		{
			name:        "Description at max length",
			description: strings.Repeat("a", 5000),
			wantError:   false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateStoryDescription(tc.description)

			if tc.wantError {
				if err == nil {
					t.Errorf("Expected error but got none")
				} else if !strings.Contains(err.Message, tc.errorMsg) {
					t.Errorf("Error message %q does not contain %q", err.Message, tc.errorMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %s", err.Message)
				}
			}
		})
	}
}

func TestValidateStoryInput(t *testing.T) {
	testCases := []struct {
		name          string
		title         string
		description   string
		expectedCount int
	}{
		{
			name:          "Valid input",
			title:         "Valid Title",
			description:   "Valid description",
			expectedCount: 0,
		},
		{
			name:          "Both invalid",
			title:         "",
			description:   "",
			expectedCount: 2,
		},
		{
			name:          "Only title invalid",
			title:         "",
			description:   "Valid description",
			expectedCount: 1,
		},
		{
			name:          "Only description invalid",
			title:         "Valid Title",
			description:   "",
			expectedCount: 1,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			errors := ValidateStoryInput(tc.title, tc.description)

			if len(errors) != tc.expectedCount {
				t.Errorf("Expected %d errors, got %d", tc.expectedCount, len(errors))
			}
		})
	}
}
