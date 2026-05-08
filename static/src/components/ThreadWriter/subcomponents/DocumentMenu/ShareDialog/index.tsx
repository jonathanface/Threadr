import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../api";
import { useSelections } from "../../../../../hooks/useSelections";
import { ShareLink } from "../../../../../types/Sharing";
import { usePostHog } from "@posthog/react";

interface ShareDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ShareDialog = ({ open, setOpen }: ShareDialogProps) => {
  const posthog = usePostHog();
  const { story } = useSelections();
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [readerEmail, setReaderEmail] = useState("");
  const [readerFirstName, setReaderFirstName] = useState("");
  const [readerLastName, setReaderLastName] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchLinks = useCallback(async () => {
    if (!story?.story_id) return;
    setLoading(true);
    try {
      const res = await api.get<ShareLink[]>(
        `/stories/${story.story_id}/share-links`,
      );
      setShareLinks(res.data || []);
    } catch (err) {
      console.error("Failed to fetch share links:", err);
    } finally {
      setLoading(false);
    }
  }, [story?.story_id]);

  useEffect(() => {
    if (open) {
      fetchLinks();
    }
  }, [open, fetchLinks]);

  const handleCreate = async () => {
    setAttempted(true);
    setFormError("");
    setSuccessMessage("");
    if (!story?.story_id || !readerEmail || !readerFirstName || !readerLastName)
      return;

    setCreating(true);
    try {
      await api.post(`/stories/${story.story_id}/share`, {
        story_id: story.story_id,
        reader_email: readerEmail,
        reader_first_name: readerFirstName,
        reader_last_name: readerLastName,
        comments_enabled: commentsEnabled,
        expires_at: 0,
      });
      posthog?.capture("story_shared", { story_id: story.story_id, comments_enabled: commentsEnabled });
      const invitedName = `${readerFirstName} ${readerLastName}`;
      setSuccessMessage(
        `${invitedName} has been invited and will receive an email with their link. You can also copy the link next to their name and send it to them yourself.`,
      );
      setReaderEmail("");
      setReaderFirstName("");
      setReaderLastName("");
      setCommentsEnabled(true);
      setAttempted(false);
      fetchLinks();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setFormError(err.response.data.error);
      } else {
        setFormError("Failed to create invite. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (token: string) => {
    try {
      await api.put(`/share-links/${token}/revoke`);
      posthog?.capture("share_link_revoked", { story_id: story?.story_id });
      fetchLinks();
    } catch (err) {
      console.error("Failed to remove reader:", err);
    }
  };

  const handleRestore = async (token: string) => {
    try {
      await api.put(`/share-links/${token}/restore`);
      fetchLinks();
    } catch (err) {
      console.error("Failed to restore reader:", err);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
        },
      }}
    >
      <DialogTitle sx={{ color: "var(--text-primary)" }}>
        Share Story
      </DialogTitle>
      <DialogContent sx={{ color: "var(--text-primary)" }}>
        <Typography
          variant="body2"
          sx={{ mb: 2, color: "var(--text-secondary)" }}
        >
          Invite readers by email. Each reader gets a unique link.
        </Typography>

        {/* Create new share link form */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            mb: 3,
            p: 2,
            border: "1px solid var(--border-medium)",
            borderRadius: 1,
          }}
        >
          <Typography variant="subtitle2">Invite a Reader</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="First Name"
              size="small"
              value={readerFirstName}
              onChange={(e) => setReaderFirstName(e.target.value)}
              error={attempted && !readerFirstName}
              helperText={attempted && !readerFirstName ? "Required" : ""}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Last Name"
              size="small"
              value={readerLastName}
              onChange={(e) => setReaderLastName(e.target.value)}
              error={attempted && !readerLastName}
              helperText={attempted && !readerLastName ? "Required" : ""}
              sx={{ flex: 1 }}
            />
          </Box>
          <TextField
            label="Email"
            size="small"
            type="email"
            fullWidth
            value={readerEmail}
            onChange={(e) => setReaderEmail(e.target.value)}
            error={attempted && !readerEmail}
            helperText={attempted && !readerEmail ? "Required" : ""}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={commentsEnabled}
                onChange={(e) => setCommentsEnabled(e.target.checked)}
                sx={{ color: "var(--text-primary)" }}
              />
            }
            label="Allow comments"
          />
          {formError && (
            <Typography variant="body2" color="error">
              {formError}
            </Typography>
          )}
          {successMessage && (
            <Typography variant="body2" color="success.main">
              {successMessage}
            </Typography>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={handleCreate}
            disabled={
              creating || !readerEmail || !readerFirstName || !readerLastName
            }
          >
            {creating ? "Inviting..." : "Invite Reader"}
          </Button>
        </Box>

        {/* Existing share links */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Active Readers
        </Typography>
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        ) : shareLinks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No readers invited yet.
          </Typography>
        ) : (
          <List dense>
            {shareLinks.map((link) => (
              <ListItem
                key={link.token}
                sx={{
                  opacity: link.revoked ? 0.5 : 1,
                  border: "1px solid var(--border-light)",
                  borderRadius: 1,
                  mb: 0.5,
                }}
                secondaryAction={
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {link.revoked ? (
                      <Tooltip title="Restore access">
                        <IconButton
                          size="small"
                          onClick={() => handleRestore(link.token)}
                        >
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <>
                        <Tooltip
                          title={
                            copiedToken === link.token ? "Copied!" : "Copy link"
                          }
                        >
                          <IconButton
                            size="small"
                            onClick={() => copyLink(link.token)}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove reader">
                          <IconButton
                            size="small"
                            onClick={() => handleRemove(link.token)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                }
              >
                <ListItemText
                  primary={`${link.reader_first_name} ${link.reader_last_name}`}
                  secondary={
                    <>
                      {link.reader_email}
                      {link.revoked && " (Revoked)"}
                      {link.comments_enabled && " | Comments enabled"}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
