import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Box, Typography, Chip, FormControlLabel, Checkbox } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DescriptionIcon from "@mui/icons-material/Description";
import { useToaster } from "../../../hooks/useToaster";
import { AlertToastType } from "../../../types/AlertToasts";

const ACCEPTED_EXTENSIONS = [".docx", ".txt"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface DocumentImporterProps {
  importFile: File | null;
  onFileSelected: (file: File | null) => void;
  skipFirstPage: boolean;
  onSkipFirstPageChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const DocumentImporter: React.FC<DocumentImporterProps> = ({
  importFile,
  onFileSelected,
  skipFirstPage,
  onSkipFirstPageChange,
  disabled,
}) => {
  const { setAlertState } = useToaster();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setAlertState({
          title: "Unsupported file type",
          message: "Only .docx and .txt files are supported.",
          severity: AlertToastType.warning,
          open: true,
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setAlertState({
          title: "File too large",
          message: "Maximum file size is 20MB.",
          severity: AlertToastType.warning,
          open: true,
        });
        return;
      }

      onFileSelected(file);
    },
    [onFileSelected, setAlertState]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled,
  });

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileSelected(null);
    },
    [onFileSelected]
  );

  return (
    <Box>
      <Box
        {...getRootProps()}
        sx={{
          border: "2px dashed",
          borderColor: isDragActive ? "primary.main" : "divider",
          borderRadius: 2,
          p: 2,
          textAlign: "center",
          cursor: disabled ? "default" : "pointer",
          bgcolor: isDragActive ? "action.hover" : "transparent",
          opacity: disabled ? 0.5 : 1,
          transition: "all 0.2s",
          "&:hover": disabled
            ? {}
            : { borderColor: "primary.main", bgcolor: "action.hover" },
        }}
      >
        <input {...getInputProps()} />

        {importFile ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <DescriptionIcon color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {importFile.name}
            </Typography>
            <Chip
              label="Remove"
              size="small"
              onDelete={handleRemove}
              onClick={handleRemove}
              sx={{ ml: 1 }}
            />
          </Box>
        ) : (
          <Box>
            <UploadFileIcon sx={{ fontSize: 32, color: "text.secondary", mb: 0.5 }} />
            <Typography variant="body2" color="text.secondary">
              Import from a file (optional)
            </Typography>
            <Typography variant="caption" color="text.disabled">
              .docx or .txt
            </Typography>
          </Box>
        )}
      </Box>

      {importFile && (
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={skipFirstPage}
              onChange={(e) => onSkipFirstPageChange(e.target.checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Skip title page
            </Typography>
          }
          sx={{ mt: 0.5, ml: 0 }}
        />
      )}
    </Box>
  );
};
