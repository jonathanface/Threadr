import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../../api";
import { useSelections } from "../../../../../hooks/useSelections";
import { useWorksList } from "../../../../../hooks/useWorksList";
import { Story } from "../../../../../types/Story";

// Pick the id that PromoteNewRoot would select on the backend so the
// confirmation prompt can name it: the current draft if any, otherwise
// the oldest non-root draft in the ancestry.
const previewPromotionTarget = (drafts: Story[]): Story | null => {
  const nonRoot = drafts.filter((d) => d.original_story_id);
  if (nonRoot.length === 0) return null;
  const current = nonRoot.find((d) => d.is_current_draft);
  if (current) return current;
  return nonRoot[0];
};

interface DraftsDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const DraftsDialog = ({ open, setOpen }: DraftsDialogProps) => {
  const navigate = useNavigate();
  const { story, deselectChapter } = useSelections();
  const { refresh: refreshWorksList } = useWorksList();
  const [drafts, setDrafts] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Pending delete target: null when no confirm is open.
  const [deleteTarget, setDeleteTarget] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);

  const promotionTarget = useMemo(
    () => (deleteTarget && !deleteTarget.original_story_id ? previewPromotionTarget(drafts) : null),
    [deleteTarget, drafts],
  );

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
    if (!trimmed) {
      setError("Give the draft a name before creating it.");
      return;
    }
    if (!story?.story_id) return;
    setCreating(true);
    setError("");
    try {
      const res = await api.post<Story>(`/stories/${story.story_id}/drafts`, {
        draft_name: trimmed,
      });
      setNewName("");
      await fetchDrafts();
      // New draft is auto-promoted to current — the /stories list filter
      // now admits it and hides the previous current. Nudge the works-
      // list cache so navigating back to /stories reflects that.
      refreshWorksList();
      // Jump into the new draft so the editor is pointed at it.
      if (res.data?.story_id) {
        // Preserve the user's chapter selection across the clone: the
        // backend copies chapters in order, so the chapter at index N
        // of the source has an equivalent chapter at index N of the
        // new draft. Carrying the raw ?chapter= uuid across would land
        // on a stale id that doesn't exist in the new draft and render
        // a blank editor.
        const params = new URLSearchParams(window.location.search);
        const currentChapterID = params.get("chapter");
        let destination = `/stories/${res.data.story_id}`;
        if (
          currentChapterID &&
          story.chapters &&
          res.data.chapters &&
          res.data.chapters.length > 0
        ) {
          const idx = story.chapters.findIndex(
            (c) => c.id === currentChapterID,
          );
          if (idx >= 0 && res.data.chapters[idx]) {
            destination += `?chapter=${res.data.chapters[idx].id}`;
          }
        }
        navigate(destination);
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
      // Which row the stories-list filter admits for this ancestry
      // just changed; refresh so /stories stays in sync.
      refreshWorksList();
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

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setError("");
    setDeleting(true);

    // Compute "the new current" post-delete so we can navigate the user
    // there regardless of which draft they were viewing. Mirrors the
    // server-side promotion rules in enforceDraftsDeleteGuards +
    // PromoteNewRoot so the frontend lands on the same draft the
    // backend ends up marking current.
    const remaining = drafts.filter((d) => d.story_id !== deleteTarget.story_id);
    let newCurrentID: string | null = null;
    const stillCurrent = remaining.find((d) => d.is_current_draft);
    if (stillCurrent) {
      // Deleted a non-current row; whoever already held is_current_draft
      // keeps it.
      newCurrentID = stillCurrent.story_id;
    } else if (deleteTarget.original_story_id) {
      // Deleted the current draft (non-root): backend promotes root.
      const root = remaining.find((d) => !d.original_story_id);
      newCurrentID = root?.story_id ?? null;
    } else {
      // Deleted the root while drafts exist: backend's PromoteNewRoot
      // picks the current draft, else the oldest non-root.
      const promoted = previewPromotionTarget(remaining);
      newCurrentID = promoted?.story_id ?? null;
    }

    try {
      await api.delete(`/stories/${deleteTarget.story_id}`);
      setDeleteTarget(null);
      // The delete may have moved the current pointer (deleted current
      // → root promoted; deleted root with drafts → PromoteNewRoot).
      // Either way the stories-list filter sees a different row now.
      refreshWorksList();
      if (newCurrentID && newCurrentID !== story?.story_id) {
        // The user was elsewhere than the new current, or they were on
        // the deleted story. Either way, land them on the new current
        // so they're not stuck looking at a story they didn't choose
        // (and so a stale story_id in context doesn't 404 the next
        // ancestry-aware read).
        //
        // Clear the chapter selection in the shared selections context
        // first: useSelections().chapter still holds a chapter id that
        // belonged to the deleted draft, and the editor's content
        // fetch keys off that id — leaving it in place causes a
        // /content?chapter=<deleted-chapter-id> request that 404s on
        // the new story. The editor will pick a default chapter when
        // the new story loads.
        deselectChapter();
        navigate(`/stories/${newCurrentID}`);
        setOpen(false);
        return;
      }
      await fetchDrafts();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError(err.response.data?.error || "Delete the drafts first before deleting the original.");
      } else {
        setError("Could not delete draft. Please try again.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSwitchTo = async (id: string) => {
    // Preserve chapter position across the switch: resolve the current
    // chapter's index in the source story and map to the chapter at the
    // same index in the destination. If anything fails (no chapter
    // selected, mapping can't be resolved, destination fetch errors)
    // just navigate to the base story URL and let the editor decide.
    const params = new URLSearchParams(window.location.search);
    const currentChapterID = params.get("chapter");
    let destination = `/stories/${id}`;
    if (currentChapterID && story?.chapters) {
      const idx = story.chapters.findIndex((c) => c.id === currentChapterID);
      if (idx >= 0) {
        try {
          const res = await api.get<Story>(`/stories/${id}`);
          if (res.data?.chapters && res.data.chapters[idx]) {
            destination += `?chapter=${res.data.chapters[idx].id}`;
          }
        } catch {
          // Fall through to the base-URL destination.
        }
      }
    }
    navigate(destination);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => !creating && setOpen(false)}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Drafts</DialogTitle>
      {creating && (
        <LinearProgress
          aria-label="Creating draft"
          sx={{ height: 3 }}
        />
      )}
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
                  <Tooltip title={d.original_story_id ? "Delete draft" : "Delete original"}>
                    <IconButton
                      aria-label="delete"
                      onClick={() => setDeleteTarget(d)}
                    >
                      <DeleteIcon />
                    </IconButton>
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
        <Box sx={{ mt: 3, display: "flex", gap: 1, alignItems: "center" }}>
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
            disabled={creating}
            startIcon={
              creating ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {creating ? "Cloning story..." : "Create draft"}
          </Button>
        </Box>
        {creating && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1 }}
          >
            Copying chapters, blocks, and outline. This can take a few
            seconds for larger stories.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={creating}>
          Close
        </Button>
      </DialogActions>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        <DialogTitle>
          {deleteTarget?.original_story_id
            ? `Delete draft "${deleteTarget?.draft_name || "Untitled draft"}"?`
            : `Delete the original of "${deleteTarget?.title ?? "this story"}"?`}
        </DialogTitle>
        <DialogContent>
          {deleteTarget && !deleteTarget.original_story_id ? (
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                This is the original of the story. Deleting it will promote
                {" "}<strong>{promotionTarget?.draft_name || "the current draft"}</strong>{" "}
                to become the new original. The original's content, chapters,
                and outline will be <strong>permanently removed</strong> and
                cannot be restored. Associations and existing reader share
                links will be transferred to the new original.
              </Typography>
              <Typography variant="body2" color="error">
                This cannot be undone.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                This draft's content, chapters, and comments will be
                permanently removed.
              </Typography>
              <Typography variant="body2" color="error">
                This cannot be undone.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirmed}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};
