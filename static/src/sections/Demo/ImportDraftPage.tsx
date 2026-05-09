import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { useDemoConversion } from "./hooks/useDemoConversion";
import { DEMO_PENDING_CONVERSION_KEY, clearDraft, readDraft } from "./storage";

export const ImportDraftPage = () => {
  const navigate = useNavigate();
  const { setAlertState } = useToaster();
  const { convert } = useDemoConversion();

  const initialDraft = useRef(readDraft());
  const savedTitle = initialDraft.current?.title?.trim() ?? "";
  const initialTitle = savedTitle.length > 0 ? savedTitle : "Untitled story";

  const [title, setTitle] = useState<string>(initialTitle);
  const [submitting, setSubmitting] = useState<boolean>(
    Boolean(initialDraft.current),
  );
  const [error, setError] = useState<string | null>(null);
  const autoConvertedRef = useRef(false);

  const runConvert = async (chosenTitle: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await convert(chosenTitle);
      setAlertState({
        title: "Your draft is now a story",
        message:
          result.association_count > 0
            ? `Imported ${result.block_count} blocks and ${result.association_count} story elements.`
            : `Imported ${result.block_count} blocks.`,
        severity: AlertToastType.success,
        open: true,
      });
      navigate(`/stories/${result.story.story_id}`, { replace: true });
    } catch (err) {
      console.error("Demo conversion failed:", err);
      setError(
        "We couldn't import your draft. Please try again, or contact support if the problem continues.",
      );
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!initialDraft.current) {
      localStorage.removeItem(DEMO_PENDING_CONVERSION_KEY);
      navigate("/stories", { replace: true });
      return;
    }
    if (!autoConvertedRef.current) {
      autoConvertedRef.current = true;
      runConvert(initialTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError("Please name your story.");
      return;
    }
    if (trimmed.length > 200) {
      setError("Title must be 200 characters or fewer.");
      return;
    }
    runConvert(trimmed);
  };

  const handleDiscard = () => {
    const confirmed = window.confirm(
      "Discard your trial draft? This cannot be undone.",
    );
    if (!confirmed) return;
    clearDraft();
    localStorage.removeItem(DEMO_PENDING_CONVERSION_KEY);
    navigate("/stories", { replace: true });
  };

  // Show the spinner while auto-converting; the form below is the error-recovery fallback.
  if (submitting && !error) {
    return (
      <Box
        sx={{
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
          p: 3,
        }}
      >
        <CircularProgress />
        <Typography variant="body1">Importing your draft…</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 520, width: "100%" }}>
        <Typography variant="h5" component="h1" gutterBottom>
          One last step — name your story
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We saved the draft you started in the trial. Give it a title and
          we'll import it into your account.
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            label="Story title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            autoFocus
            required
            inputProps={{ maxLength: 200 }}
            disabled={submitting}
            sx={{ mb: 2 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button
              type="button"
              onClick={handleDiscard}
              disabled={submitting}
              color="inherit"
            >
              Discard draft
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={submitting}
            >
              {submitting ? "Importing…" : "Import to my account"}
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
};
