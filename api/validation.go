package api

import (
	"Threadr/models"
	"fmt"
	"regexp"
	"strings"
)

// Keep this pattern in sync with frontend validation in CreateOrEditStory/utils/validation.ts.
var allowedPattern = regexp.MustCompile(`^[A-Za-z0-9 +\-\=\.\_\:\,\'\"\/@]*$`)

// ValidationError represents a validation failure.
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}

// ValidateStoryTitle validates a story title according to frontend rules.
func ValidateStoryTitle(title string) *ValidationError {
	trimmed := strings.TrimSpace(title)

	if trimmed == "" {
		return &ValidationError{
			Field:   "title",
			Message: "Story title is required",
		}
	}

	if len(trimmed) > maxTitleLength {
		return &ValidationError{
			Field: "title",
			Message: fmt.Sprintf(
				"Title is too long (%d characters). Maximum is %d characters",
				len(trimmed),
				maxTitleLength,
			),
		}
	}

	if strings.HasPrefix(strings.ToLower(trimmed), awsPrefix) {
		return &ValidationError{
			Field:   "title",
			Message: fmt.Sprintf("Title cannot start with \"%s\"", awsPrefix),
		}
	}

	if !allowedPattern.MatchString(trimmed) {
		return &ValidationError{
			Field:   "title",
			Message: `Title may only contain letters, numbers, spaces, and the following characters: + - = . _ : / @ , ' "`,
		}
	}

	return nil
}

// ValidateStoryDescription validates a story description.
func ValidateStoryDescription(description string) *ValidationError {
	trimmed := strings.TrimSpace(description)

	if trimmed == "" {
		return &ValidationError{
			Field:   "description",
			Message: "A brief description is required",
		}
	}

	if len(trimmed) > maxDescriptionLength {
		return &ValidationError{
			Field: "description",
			Message: fmt.Sprintf(
				"Description is too long (%d characters). Maximum is %d characters",
				len(trimmed),
				maxDescriptionLength,
			),
		}
	}

	return nil
}

// ValidateStoryInput validates all story input fields.
// ValidateStoryInput validates all story input fields
// validateStorySettings normalizes and validates a StorySettings payload.
// Empty/zero typography fields are accepted and treated as "use defaults".
func validateStorySettings(s *models.StorySettings) error {
	if s.FontFamily != "" && !models.AllowedFonts[s.FontFamily] {
		return fmt.Errorf("font_family %q is not allowed", s.FontFamily)
	}
	if s.FontSize != 0 && (s.FontSize < models.MinFontSize || s.FontSize > models.MaxFontSize) {
		return fmt.Errorf("font_size must be between %d and %d", models.MinFontSize, models.MaxFontSize)
	}
	if s.LineSpacing != 0 && (s.LineSpacing < models.MinLineSpacing || s.LineSpacing > models.MaxLineSpacing) {
		return fmt.Errorf("line_spacing must be between %.1f and %.1f", models.MinLineSpacing, models.MaxLineSpacing)
	}
	return nil
}

func ValidateStoryInput(title, description string) []ValidationError {
	errors := []ValidationError{}

	if err := ValidateStoryTitle(title); err != nil {
		errors = append(errors, *err)
	}

	if err := ValidateStoryDescription(description); err != nil {
		errors = append(errors, *err)
	}

	return errors
}
