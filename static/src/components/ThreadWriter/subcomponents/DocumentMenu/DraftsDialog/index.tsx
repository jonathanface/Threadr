import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../../api";
import { useSelections } from "../../../../../hooks/useSelections";
import { Story } from "../../../../../types/Story";

interface DraftsDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const DraftsDialog = ({ open, setOpen }: DraftsDialogProps) => {
  const navigate = useNavigate();
  const { story } = useSelections();
  const [drafts, setDrafts] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Narrowed to story_id so fetchDrafts' identity doesn't churn.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const fetchDrafts = useCallback(async () => {
    if (!story?.story_id) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get<Story[]>(`/stories/${story.story_id}/drafts`);
      setDrafts(res.data || []);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        setError("Drafts are only available to subscribers.");
      } else {
        setError("Could not load drafts. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [story?.story_id]);

  useEffect(() => {
    if (open) {
      // Data fetch when dialog opens
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchDrafts();
    }
  }, [open, fetchDrafts]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !story?.story_id) return;
    setCreating(true);
    setError("");
    try {
      const res = await api.post<Story>(`/stories/${story.story_id}/drafts`, {
        draft_name: trimmed,
      });
      setNewName("");
      await fetchDrafts();
      // Jump into the new draft so the editor is pointed at it.
      if (res.data?.story_id) {
        navigate(`/story/${res.data.story_id}`);
        setOpen(false);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        setError("Drafts are only available to subscribers.");
      } else {
        setError("Could not create draft. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSetCurrent = async (id: string) => {
    setError("");
    try {
      await api.post(`/stories/${id}/drafts/current`, {});
      await fetchDrafts();
    } catch {
      setError("Could not set current draft. Please try again.");
    }
  };

  const handleRenameStart = (d: Story) => {
    setRenamingID(d.story_id);
    setRenameValue(d.draft_name ?? "");
  };

  const handleRenameSubmit = async () => {
    if (!renamingID) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setError("");
    try {
      await api.put(`/stories/${renamingID}/draft-name`, {
        draft_name: trimmed,
      });
      setRenamingID(null);
      setRenameValue("");
      await fetchDrafts();
    } catch {
      setError("Could not rename draft. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      await api.delete(`/stories/${id}`);
      await fetchDrafts();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError(err.response.data?.error || "Delete the drafts first before deleting the original.");
      } else {
        setError("Could not delete draft. Please try again.");
      }
    }
  };

  const handleSwitchTo = (id: string) => {
    navigate(`/story/${id}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Drafts</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Keep multiple drafts of this story and switch between them. The current draft is highlighted and is what the stories list and share links point to.
        </Typography>
        <List dense disablePadding>
          {drafts.map((d) => {
            const isCurrent = d.is_current_draft ?? false;
            const label = d.draft_name && d.draft_name.trim().length > 0
              ? d.draft_name
              : d.original_story_id
                ? "Untitled draft"
                : "Original";
            return (
              <ListItem
                key={d.story_id}
                divider
                sx={{
                  backgroundColor: isCurrent ? "action.selected" : undefined,
                  pr: 14,
                }}
              >
                {renamingID === d.story_id ? (
                  <TextField
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    size="small"
                    fullWidth
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit();
                      if (e.key === "Escape") {
                        setRenamingID(null);
                        setRenameValue("");
                      }
                    }}
                  />
                ) : (
                  <ListItemText
                    primary={label}
                    secondary={d.story_id === story?.story_id ? "You are editing this draft" : undefined}
                    onClick={() => d.story_id !== story?.story_id && handleSwitchTo(d.story_id)}
                    sx={{ cursor: d.story_id !== story?.story_id ? "pointer" : "default" }}
                  />
                )}
                <ListItemSecondaryAction>
                  <Tooltip title={isCurrent ? "Current draft" : "Set as current"}>
                    <span>
                      <IconButton
                        aria-label="set as current"
                        onClick={() => !isCurrent && handleSetCurrent(d.story_id)}
                        disabled={isCurrent}
                      >
                        {isCurrent ? <StarIcon /> : <StarBorderIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Rename">
                    <IconButton aria-label="rename" onClick={() => handleRenameStart(d)}>
                      <DriveFileRenameOutlineIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={d.original_story_id ? "Delete draft" : "Delete original (unavailable while drafts exist)"}>
                    <span>
                      <IconButton
                        aria-label="delete"
                        onClick={() => d.original_story_id && handleDelete(d.story_id)}
                        disabled={!d.original_story_id && drafts.length > 1}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            );
          })}
          {!loading && drafts.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No drafts yet. Create one below to try an alternate ending or revision.
            </Typography>
          )}
        </List>
        <Box sx={{ mt: 3, display: "flex", gap: 1 }}>
          <TextField
            label="New draft name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            size="small"
            fullWidth
            disabled={creating}
          />
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            Create draft
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
