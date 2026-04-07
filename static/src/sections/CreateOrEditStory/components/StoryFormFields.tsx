import React from "react";
import { TextField, Typography, Box } from "@mui/material";
import { getRemainingChars, getCharCountColor } from "../utils/validation";

const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 5000;

interface StoryFormFieldsProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  titleError?: string;
  descriptionError?: string;
}

export const StoryFormFields: React.FC<StoryFormFieldsProps> = ({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  titleError,
  descriptionError,
}) => {
  const titleRemaining = getRemainingChars(title, MAX_TITLE_LENGTH);
  const descRemaining = getRemainingChars(description, MAX_DESCRIPTION_LENGTH);

  return (
    <>
      <Box>
        <TextField
          label="Title *"
          fullWidth
          required
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          margin="normal"
          error={Boolean(titleError)}
          helperText={titleError}
          inputProps={{
            maxLength: MAX_TITLE_LENGTH,
            "aria-label": "Story title",
            "aria-required": "true",
            "aria-invalid": Boolean(titleError),
            "aria-describedby": titleError ? "title-error" : "title-helper",
          }}
        />
        <Typography
          id="title-helper"
          variant="caption"
          sx={{
            display: "block",
            textAlign: "right",
            color: getCharCountColor(titleRemaining, MAX_TITLE_LENGTH),
            mt: 0.5,
          }}
        >
          {title.length}/{MAX_TITLE_LENGTH}
        </Typography>
      </Box>

      <Box>
        <TextField
          label="Write a brief summary of your story *"
          fullWidth
          required
          multiline
          rows={4}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          margin="normal"
          error={Boolean(descriptionError)}
          helperText={descriptionError}
          inputProps={{
            maxLength: MAX_DESCRIPTION_LENGTH,
            "aria-label": "Story description",
            "aria-required": "true",
            "aria-invalid": Boolean(descriptionError),
            "aria-describedby": descriptionError
              ? "description-error"
              : "description-helper",
          }}
        />
        <Typography
          id="description-helper"
          variant="caption"
          sx={{
            display: "block",
            textAlign: "right",
            color: getCharCountColor(descRemaining, MAX_DESCRIPTION_LENGTH),
            mt: 0.5,
          }}
        >
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </Typography>
      </Box>
    </>
  );
};
