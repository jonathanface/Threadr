package daos

import (
	"context"
	"errors"
	"os"
	"testing"

	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Tests for GenerateStoryOutlineSections.
func TestGenerateStoryOutlineSections(t *testing.T) {
	t.Run("ThreeAct template generates 3 sections", func(t *testing.T) {
		sections := GenerateStoryOutlineSections(models.ThreeAct)

		if len(sections) != 3 {
			t.Errorf("Expected 3 sections, got %d", len(sections))
		}

		// Verify section order and headers
		expectedHeaders := []string{"Setup", "Confrontation", "Resolution"}
		for i, expected := range expectedHeaders {
			if sections[i].Header != expected {
				t.Errorf("Section %d: expected header %q, got %q", i, expected, sections[i].Header)
			}
			if sections[i].Place != i {
				t.Errorf("Section %d: expected Place=%d, got %d", i, i, sections[i].Place)
			}
			if sections[i].Description == "" {
				t.Errorf("Section %d: description should not be empty", i)
			}
		}
	})

	t.Run("ThreeAct sections have proper descriptions", func(t *testing.T) {
		sections := GenerateStoryOutlineSections(models.ThreeAct)

		// Verify each section has a meaningful description
		for i, section := range sections {
			if len(section.Description) < 10 {
				t.Errorf("Section %d description too short: %q", i, section.Description)
			}
		}
	})

	t.Run("FiveAct template generates 5 sections", func(t *testing.T) {
		sections := GenerateStoryOutlineSections(models.FiveAct)

		if len(sections) != 5 {
			t.Errorf("Expected 5 sections, got %d", len(sections))
		}

		expectedHeaders := []string{"Exposition", "Rising Action", "Climax", "Falling Action", "Resolution"}
		for i, expected := range expectedHeaders {
			if sections[i].Header != expected {
				t.Errorf("Section %d: expected header %q, got %q", i, expected, sections[i].Header)
			}
			if sections[i].Place != i {
				t.Errorf("Section %d: expected Place=%d, got %d", i, i, sections[i].Place)
			}
		}
	})

	t.Run("HeroJourney template generates 12 sections", func(t *testing.T) {
		sections := GenerateStoryOutlineSections(models.HeroJourney)

		if len(sections) != 12 {
			t.Errorf("Expected 12 sections for Hero's Journey, got %d", len(sections))
		}

		expectedHeaders := []string{
			"Ordinary World",
			"Call to Adventure",
			"Refusal of the Call",
			"Meeting the Mentor",
			"Crossing the Threshold",
			"Tests, Allies, and Enemies",
			"Approach to the Innermost Cave",
			"The Ordeal",
			"The Reward",
			"The Road Back",
			"Resurrection",
			"Return with the Elixir",
		}

		for i, expected := range expectedHeaders {
			if sections[i].Header != expected {
				t.Errorf("Section %d: expected header %q, got %q", i, expected, sections[i].Header)
			}
			if sections[i].Place != i {
				t.Errorf("Section %d: expected Place=%d, got %d", i, i, sections[i].Place)
			}
			if sections[i].Description == "" {
				t.Errorf("Section %d: description should not be empty", i)
			}
		}
	})

	t.Run("Unknown template returns empty sections", func(t *testing.T) {
		sections := GenerateStoryOutlineSections(models.OutlineTemplate("InvalidTemplate"))

		if len(sections) != 0 {
			t.Errorf("Expected 0 sections for unknown template, got %d", len(sections))
		}
	})

	t.Run("All sections have non-negative Place values", func(t *testing.T) {
		templates := []models.OutlineTemplate{models.ThreeAct, models.FiveAct, models.HeroJourney}

		for _, template := range templates {
			sections := GenerateStoryOutlineSections(template)
			for i, section := range sections {
				if section.Place < 0 {
					t.Errorf("%s template, section %d: Place should be non-negative, got %d",
						template, i, section.Place)
				}
			}
		}
	})

	t.Run("Place values are sequential", func(t *testing.T) {
		templates := []models.OutlineTemplate{models.ThreeAct, models.FiveAct, models.HeroJourney}

		for _, template := range templates {
			sections := GenerateStoryOutlineSections(template)
			for i, section := range sections {
				if section.Place != i {
					t.Errorf("%s template, section %d: expected Place=%d, got %d",
						template, i, i, section.Place)
				}
			}
		}
	})
}

// Tests for GetTableSuffix.
func TestGetTableSuffix(t *testing.T) {
	tests := []struct {
		name     string
		mode     string
		expected string
	}{
		{
			name:     "production mode returns empty suffix",
			mode:     "production",
			expected: "",
		},
		{
			name:     "PRODUCTION uppercase returns empty suffix",
			mode:     "PRODUCTION",
			expected: "",
		},
		{
			name:     "staging mode returns _staging suffix",
			mode:     "staging",
			expected: "_staging",
		},
		{
			name:     "development mode returns _staging suffix",
			mode:     "development",
			expected: "_staging",
		},
		{
			name:     "STAGING uppercase returns _staging suffix",
			mode:     "STAGING",
			expected: "_staging",
		},
		{
			name:     "empty mode returns _staging suffix",
			mode:     "",
			expected: "_staging",
		},
		{
			name:     "unknown mode returns _staging suffix",
			mode:     "test",
			expected: "_staging",
		},
		{
			name:     "mixed case Production returns empty suffix",
			mode:     "Production",
			expected: "",
		},
		{
			name:     "mixed case StAgInG returns _staging suffix",
			mode:     "StAgInG",
			expected: "_staging",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("MODE", tt.mode)
			if tt.mode == "" {
				os.Unsetenv("MODE")
			}

			result := GetTableSuffix()
			if result != tt.expected {
				t.Errorf("GetTableSuffix() = %q, want %q (MODE=%q)", result, tt.expected, tt.mode)
			}
		})
	}
}

// Tests for CleanDynamoTagString.
func TestCleanDynamoTagString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple valid string unchanged",
			input:    "MyTag",
			expected: "MyTag",
		},
		{
			name:     "allowed characters preserved",
			input:    "tag-name_with.chars:123/@+=",
			expected: "tag-name_with.chars:123/@+=",
		},
		{
			name:     "aws prefix removed (lowercase)",
			input:    "aws:my-tag",
			expected: "my-tag",
		},
		{
			name:     "AWS prefix removed (uppercase)",
			input:    "AWS:my-tag",
			expected: "my-tag",
		},
		{
			name:     "aws prefix removed (mixed case)",
			input:    "AwS:my-tag",
			expected: "my-tag",
		},
		{
			name:     "multiple aws prefixes removed",
			input:    "aws:aws:tag",
			expected: "tag",
		},
		{
			name:     "disallowed characters removed",
			input:    "tag!@#$%^&*()name",
			expected: "tag@name",
		},
		{
			name:     "special characters removed",
			input:    "tag<>[]{}|\\name",
			expected: "tagname",
		},
		{
			name:     "unicode characters removed",
			input:    "tag名前name",
			expected: "tagname",
		},
		{
			name:     "spaces preserved",
			input:    "my tag name",
			expected: "my tag name",
		},
		{
			name:     "leading and trailing spaces trimmed",
			input:    "  tag-name  ",
			expected: "tag-name",
		},
		{
			name:     "empty string returns empty",
			input:    "",
			expected: "",
		},
		{
			name:     "only disallowed chars leaves allowed @ symbol",
			input:    "!@#$%^&*()",
			expected: "@", // @ is allowed in DynamoDB tags
		},
		{
			name:     "only aws prefix returns empty",
			input:    "aws:",
			expected: "",
		},
		{
			name:     "complex example with aws and special chars",
			input:    "aws:my-tag!name@123",
			expected: "my-tagname@123", // hyphen is allowed, ! is removed
		},
		{
			name:     "newlines and tabs removed",
			input:    "tag\nwith\nnewlines\tand\ttabs",
			expected: "tagwithnewlinesandtabs",
		},
		{
			name:     "parentheses and brackets removed",
			input:    "tag(name)[value]{key}",
			expected: "tagnamevaluekey",
		},
		{
			name:     "question mark and asterisk removed",
			input:    "tag?name*value",
			expected: "tagnamevalue",
		},
		{
			name:     "semicolon and comma removed",
			input:    "tag;name,value",
			expected: "tagnamevalue",
		},
		{
			name:     "pipe and backslash removed",
			input:    "tag|name\\value",
			expected: "tagnamevalue",
		},
		{
			name:     "allowed symbols plus minus equals preserved",
			input:    "value+1-2=3",
			expected: "value+1-2=3",
		},
		{
			name:     "allowed dot underscore colon preserved",
			input:    "name.tag_value:123",
			expected: "name.tag_value:123",
		},
		{
			name:     "allowed slash and at symbol preserved",
			input:    "path/to/resource@server",
			expected: "path/to/resource@server",
		},
		{
			name:     "aws in middle of string not removed",
			input:    "my-aws-tag",
			expected: "my-aws-tag", // Only removes "aws:" (with colon), not "aws" alone
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanDynamoTagString(tt.input)
			if result != tt.expected {
				t.Errorf("CleanDynamoTagString(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// Test CleanDynamoTagString is deterministic.
func TestCleanDynamoTagString_Deterministic(t *testing.T) {
	inputs := []string{
		"aws:my-tag!@#",
		"normal-tag",
		"  spaces  ",
		"unicode名前",
	}

	for _, input := range inputs {
		first := CleanDynamoTagString(input)
		for i := range 10 {
			result := CleanDynamoTagString(input)
			if result != first {
				t.Errorf("CleanDynamoTagString(%q) not deterministic: first=%q, iteration %d=%q",
					input, first, i, result)
			}
		}
	}
}

// Benchmark tests.
func BenchmarkGenerateStoryOutlineSections_ThreeAct(b *testing.B) {
	for range b.N {
		_ = GenerateStoryOutlineSections(models.ThreeAct)
	}
}

func BenchmarkGenerateStoryOutlineSections_FiveAct(b *testing.B) {
	for range b.N {
		_ = GenerateStoryOutlineSections(models.FiveAct)
	}
}

func BenchmarkGenerateStoryOutlineSections_HeroJourney(b *testing.B) {
	for range b.N {
		_ = GenerateStoryOutlineSections(models.HeroJourney)
	}
}

func BenchmarkGetTableSuffix(b *testing.B) {
	b.Setenv("MODE", "staging")
	b.ResetTimer()

	for range b.N {
		_ = GetTableSuffix()
	}
}

func BenchmarkCleanDynamoTagString(b *testing.B) {
	inputs := []string{
		"simple",
		"aws:complex-tag!@#$name",
		"  spaces  ",
		"very-long-tag-name-with-lots-of-characters-to-process",
	}

	b.ResetTimer()
	for range b.N {
		for _, input := range inputs {
			_ = CleanDynamoTagString(input)
		}
	}
}

// Tests for CheckForSuspendedStories.
func TestCheckForSuspendedStories(t *testing.T) {
	tests := []struct {
		name           string
		email          string
		mockScanOutput *dynamodb.ScanOutput
		mockScanError  error
		expectedResult bool
		expectedError  bool
	}{
		{
			name:  "returns true when suspended stories exist",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id":           &types.AttributeValueMemberS{Value: "story-123"},
						"author":             &types.AttributeValueMemberS{Value: "user@example.com"},
						"deleted_at":         &types.AttributeValueMemberN{Value: "1234567890"},
						"automated_deletion": &types.AttributeValueMemberBOOL{Value: true},
					},
				},
				Count: 1,
			},
			mockScanError:  nil,
			expectedResult: true,
			expectedError:  false,
		},
		{
			name:  "returns false when no suspended stories exist",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError:  nil,
			expectedResult: false,
			expectedError:  false,
		},
		{
			name:           "returns error on DynamoDB scan failure",
			email:          "user@example.com",
			mockScanOutput: nil,
			mockScanError:  errors.New("DynamoDB scan failed"),
			expectedResult: false,
			expectedError:  true,
		},
		{
			name:  "handles empty email gracefully",
			email: "",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError:  nil,
			expectedResult: false,
			expectedError:  false,
		},
		{
			name:  "returns true when multiple suspended stories exist",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id":           &types.AttributeValueMemberS{Value: "story-1"},
						"author":             &types.AttributeValueMemberS{Value: "user@example.com"},
						"deleted_at":         &types.AttributeValueMemberN{Value: "1234567890"},
						"automated_deletion": &types.AttributeValueMemberBOOL{Value: true},
					},
					{
						"story_id":           &types.AttributeValueMemberS{Value: "story-2"},
						"author":             &types.AttributeValueMemberS{Value: "user@example.com"},
						"deleted_at":         &types.AttributeValueMemberN{Value: "1234567891"},
						"automated_deletion": &types.AttributeValueMemberBOOL{Value: true},
					},
				},
				Count: 2,
			},
			mockScanError:  nil,
			expectedResult: true,
			expectedError:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockClient := mockDao.DynamoClient.(*MockDynamoClient)

			mockClient.MockScan = func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
				// Verify the filter expression is correct
				if input.FilterExpression != nil {
					expectedExpr := "author=:eml AND attribute_exists(deleted_at) AND automated_deletion=:a"
					if *input.FilterExpression != expectedExpr {
						t.Errorf("Unexpected filter expression: got %q, want %q", *input.FilterExpression, expectedExpr)
					}
				}

				if tt.mockScanError != nil {
					return nil, tt.mockScanError
				}
				return tt.mockScanOutput, nil
			}

			result, err := mockDao.CheckForSuspendedStories(context.Background(), tt.email)

			if tt.expectedError {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result != tt.expectedResult {
					t.Errorf("CheckForSuspendedStories() = %v, want %v", result, tt.expectedResult)
				}
			}
		})
	}
}

// Tests for WasStoryDeleted.
func TestWasStoryDeleted(t *testing.T) {
	tests := []struct {
		name           string
		email          string
		storyTitle     string
		mockScanOutput *dynamodb.ScanOutput
		mockScanError  error
		expectedResult bool
		expectedError  bool
	}{
		{
			name:       "returns true when story was deleted",
			email:      "user@example.com",
			storyTitle: "Deleted Story",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id":    &types.AttributeValueMemberS{Value: "story-123"},
						"author":      &types.AttributeValueMemberS{Value: "user@example.com"},
						"story_title": &types.AttributeValueMemberS{Value: "Deleted Story"},
						"deleted_at":  &types.AttributeValueMemberN{Value: "1234567890"},
					},
				},
				Count: 1,
			},
			mockScanError:  nil,
			expectedResult: true,
			expectedError:  false,
		},
		{
			name:       "returns false when story was not deleted",
			email:      "user@example.com",
			storyTitle: "Active Story",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError:  nil,
			expectedResult: false,
			expectedError:  false,
		},
		{
			name:           "returns error on DynamoDB scan failure",
			email:          "user@example.com",
			storyTitle:     "Test Story",
			mockScanOutput: nil,
			mockScanError:  errors.New("DynamoDB scan failed"),
			expectedResult: false,
			expectedError:  true,
		},
		{
			name:       "handles empty email",
			email:      "",
			storyTitle: "Test Story",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError:  nil,
			expectedResult: false,
			expectedError:  false,
		},
		{
			name:       "handles empty story title",
			email:      "user@example.com",
			storyTitle: "",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError:  nil,
			expectedResult: false,
			expectedError:  false,
		},
		{
			name:       "returns true when story title matches exactly",
			email:      "user@example.com",
			storyTitle: "My Exact Story Title",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id":    &types.AttributeValueMemberS{Value: "story-456"},
						"author":      &types.AttributeValueMemberS{Value: "user@example.com"},
						"story_title": &types.AttributeValueMemberS{Value: "My Exact Story Title"},
						"deleted_at":  &types.AttributeValueMemberN{Value: "1234567890"},
					},
				},
				Count: 1,
			},
			mockScanError:  nil,
			expectedResult: true,
			expectedError:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockClient := mockDao.DynamoClient.(*MockDynamoClient)

			mockClient.MockScan = func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
				// Verify the filter expression is correct
				if input.FilterExpression != nil {
					expectedExpr := "author=:eml AND story_title=:s AND attribute_exists(deleted_at)"
					if *input.FilterExpression != expectedExpr {
						t.Errorf("Unexpected filter expression: got %q, want %q", *input.FilterExpression, expectedExpr)
					}
				}

				if tt.mockScanError != nil {
					return nil, tt.mockScanError
				}
				return tt.mockScanOutput, nil
			}

			result, err := mockDao.WasStoryDeleted(context.Background(), tt.email, tt.storyTitle)

			if tt.expectedError {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result != tt.expectedResult {
					t.Errorf("WasStoryDeleted() = %v, want %v", result, tt.expectedResult)
				}
			}
		})
	}
}

// Tests for GetTotalCreatedStories.
func TestGetTotalCreatedStories(t *testing.T) {
	tests := []struct {
		name           string
		email          string
		mockScanOutput *dynamodb.ScanOutput
		mockScanError  error
		expectedCount  int
		expectedError  bool
	}{
		{
			name:  "returns correct count for multiple stories",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id": &types.AttributeValueMemberS{Value: "story-1"},
						"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
					},
					{
						"story_id": &types.AttributeValueMemberS{Value: "story-2"},
						"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
					},
					{
						"story_id": &types.AttributeValueMemberS{Value: "story-3"},
						"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
					},
				},
				Count: 3,
			},
			mockScanError: nil,
			expectedCount: 3,
			expectedError: false,
		},
		{
			name:  "returns zero when no stories exist",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError: nil,
			expectedCount: 0,
			expectedError: false,
		},
		{
			name:           "returns error on DynamoDB scan failure",
			email:          "user@example.com",
			mockScanOutput: nil,
			mockScanError:  errors.New("DynamoDB scan failed"),
			expectedCount:  0,
			expectedError:  true,
		},
		{
			name:  "handles empty email",
			email: "",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			},
			mockScanError: nil,
			expectedCount: 0,
			expectedError: false,
		},
		{
			name:  "returns correct count for single story",
			email: "user@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{
					{
						"story_id": &types.AttributeValueMemberS{Value: "story-1"},
						"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
					},
				},
				Count: 1,
			},
			mockScanError: nil,
			expectedCount: 1,
			expectedError: false,
		},
		{
			name:  "returns correct count for many stories",
			email: "prolific@example.com",
			mockScanOutput: &dynamodb.ScanOutput{
				Items: make([]map[string]types.AttributeValue, 50),
				Count: 50,
			},
			mockScanError: nil,
			expectedCount: 50,
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockDao := NewMockDAO()
			mockClient := mockDao.DynamoClient.(*MockDynamoClient)

			mockClient.MockScan = func(_ context.Context, input *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
				// Verify the filter expression excludes deleted stories
				if input.FilterExpression != nil {
					expectedExpr := "author=:eml AND attribute_not_exists(deleted_at)"
					if *input.FilterExpression != expectedExpr {
						t.Errorf("Unexpected filter expression: got %q, want %q", *input.FilterExpression, expectedExpr)
					}
				}

				if tt.mockScanError != nil {
					return nil, tt.mockScanError
				}
				return tt.mockScanOutput, nil
			}

			count, err := mockDao.GetTotalCreatedStories(context.Background(), tt.email)

			if tt.expectedError {
				if err == nil {
					t.Errorf("Expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if count != tt.expectedCount {
					t.Errorf("GetTotalCreatedStories() = %d, want %d", count, tt.expectedCount)
				}
			}
		})
	}
}
