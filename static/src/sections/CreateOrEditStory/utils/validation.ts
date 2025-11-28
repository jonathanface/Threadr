// Validation rules for story creation/editing
// Keep these in sync with backend validation in api/posts_story.go

//eslint-disable-next-line
const ALLOWED_PATTERN = /^[A-Za-z0-9 +\-\=\.\_\:\,\'\"\/@]*$/;
const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 5000;
const AWS_PREFIX = "aws:";

export interface ValidationError {
  field: string;
  message: string;
  currentLength?: number;
  maxLength?: number;
}

export const validateTitle = (value: string): ValidationError | null => {
  const trimmed = value.trim();

  if (!trimmed.length) {
    return {
      field: "title",
      message: "Story title is required",
    };
  }

  if (trimmed.length > MAX_TITLE_LENGTH) {
    return {
      field: "title",
      message: `Your title is ${trimmed.length} characters. Please shorten it to ${MAX_TITLE_LENGTH} or less.`,
      currentLength: trimmed.length,
      maxLength: MAX_TITLE_LENGTH,
    };
  }

  if (trimmed.toLowerCase().startsWith(AWS_PREFIX)) {
    return {
      field: "title",
      message: `Title cannot start with "${AWS_PREFIX}"`,
    };
  }

  if (!ALLOWED_PATTERN.test(trimmed)) {
    return {
      field: "title",
      message: `Title may only contain letters, numbers, spaces, and the following characters: + - = . _ : / @ , ' "`,
    };
  }

  return null;
};

export const validateDescription = (value: string): ValidationError | null => {
  const trimmed = value.trim();

  if (!trimmed.length) {
    return {
      field: "description",
      message: "A brief description is required",
    };
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return {
      field: "description",
      message: `Description is too long (${trimmed.length} characters). Maximum is ${MAX_DESCRIPTION_LENGTH}.`,
      currentLength: trimmed.length,
      maxLength: MAX_DESCRIPTION_LENGTH,
    };
  }

  return null;
};

export const validateStoryForm = (title: string, description: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  const titleError = validateTitle(title);
  if (titleError) errors.push(titleError);

  const descError = validateDescription(description);
  if (descError) errors.push(descError);

  return errors;
};

export const getRemainingChars = (text: string, maxLength: number): number => {
  return maxLength - text.length;
};

export const getCharCountColor = (remaining: number, maxLength: number): string => {
  const percentage = (remaining / maxLength) * 100;
  if (percentage < 10) return "error";
  if (percentage < 25) return "warning";
  return "text.secondary";
};
