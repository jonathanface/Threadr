import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api } from "../../../../../api";
import { useSelections } from "../../../../../hooks/useSelections";
import { Comment } from "../../../../../types/Sharing";
import { useScrollToComment } from "./CommentHighlightOverlay";

export const CommentsPanel = () => {
  const { story, chapter, setChapter } = useSelections();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollToComment = useScrollToComment();

  const fetchComments = useCallback(async () => {
    if (!story?.story_id || !chapter?.id) return;
    setLoading(true);
    try {
      const res = await api.get<Comment[]>(
        `/stories/${story.story_id}/comments?chapter=${chapter.id}`,
      );
      const fetched = res.data || [];
      setComments(fetched);
      // Update the chapter's comment count badge
      const unresolvedCount = fetched.filter((c) => !c.resolved).length;
      if (chapter && chapter.comment_count !== unresolvedCount) {
        setChapter({ ...chapter, comment_count: unresolvedCount });
      }
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setLoading(false);
    }
  }, [story?.story_id, chapter?.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleResolve = async (commentId: string) => {
    try {
      await api.put(`/comments/${commentId}/resolve`);
      fetchComments();
    } catch (err) {
      console.error("Failed to resolve comment:", err);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await api.delete(`/comments/${commentId}`);
      fetchComments();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (!chapter) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a chapter to view comments.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">
          Comments
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={fetchComments} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No comments on this chapter yet.
        </Typography>
      ) : (
        <List dense>
          {comments.map((comment) => (
            <ListItem
              key={comment.comment_id}
              onClick={() => scrollToComment(comment)}
              sx={{
                opacity: comment.resolved ? 0.5 : 1,
                border: "1px solid var(--border-light)",
                borderRadius: 1,
                mb: 1,
                flexDirection: "column",
                alignItems: "flex-start",
                cursor: "pointer",
                "&:hover": {
                  borderColor: "#ffd54f",
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  alignItems: "center",
                }}
              >
                <ListItemText
                  primary={`${comment.reader_first_name} ${comment.reader_last_name}`}
                  secondary={formatTime(comment.created_at)}
                  sx={{ m: 0 }}
                />
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  {comment.resolved ? (
                    <Chip label="Resolved" size="small" color="success" />
                  ) : (
                    <Tooltip title="Mark as resolved">
                      <IconButton
                        size="small"
                        onClick={() => handleResolve(comment.comment_id)}
                      >
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(comment.comment_id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              {comment.anchor_text_snapshot && (
                <Typography
                  variant="body2"
                  sx={{
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    borderLeft: "3px solid var(--primary)",
                    pl: 1,
                    mt: 1,
                    mb: 0.5,
                  }}
                >
                  &ldquo;{comment.anchor_text_snapshot}&rdquo;
                </Typography>
              )}
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {comment.body}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};
