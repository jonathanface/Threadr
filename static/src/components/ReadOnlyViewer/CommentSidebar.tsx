import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Comment } from "../../types/Sharing";
import { Button, Chip, Typography } from "@mui/material";
import styles from "./readonlyviewer.module.css";

interface CommentSidebarProps {
  comments: Comment[];
  readerFirstName: string;
  readerLastName: string;
  onDelete: (commentId: string) => void;
  focusedCommentId: string | null;
  onFocusClear: () => void;
  commentPositions: Record<string, number>;
}

const CARD_MIN_GAP = 12;
const CARD_MIN_HEIGHT = 180;

export const CommentSidebar = ({
  comments,
  readerFirstName,
  readerLastName,
  onDelete,
  focusedCommentId,
  onFocusClear,
  commentPositions,
}: CommentSidebarProps) => {
  const readerFullName = `${readerFirstName} ${readerLastName}`;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Clear the focus highlight after a brief flash
  useEffect(() => {
    if (!focusedCommentId) return;
    const timer = setTimeout(() => onFocusClear(), 2000);
    return () => clearTimeout(timer);
  }, [focusedCommentId, onFocusClear]);

  const hasPositions = Object.keys(commentPositions).length > 0;
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, number>>({});
  const [totalHeight, setTotalHeight] = useState<number | undefined>(undefined);

  // Initial positions based on highlight Y values (before measuring)
  const initialPositions = useMemo(() => {
    if (!hasPositions) return {};

    // Sort all comments by their highlight position, regardless of resolved status
    const sorted = [...comments]
      .sort((a, b) => (commentPositions[a.comment_id] ?? 0) - (commentPositions[b.comment_id] ?? 0));

    const positions: Record<string, number> = {};
    let nextAvailableY = 0;

    for (const comment of sorted) {
      const targetY = commentPositions[comment.comment_id] ?? nextAvailableY;
      const y = Math.max(targetY, nextAvailableY);
      positions[comment.comment_id] = y;
      nextAvailableY = y + CARD_MIN_HEIGHT + CARD_MIN_GAP;
    }

    return positions;
  }, [comments, commentPositions, hasPositions]);

  // After render, measure actual card heights and adjust positions to prevent overlap.
  // Runs only once per change to initialPositions (not on cardPositions changes).
  const measuredRef = useRef<string>("");
  useLayoutEffect(() => {
    const key = JSON.stringify(initialPositions);
    if (key === measuredRef.current) return;
    measuredRef.current = key;

    if (!hasPositions || !sidebarRef.current) {
      requestAnimationFrame(() => setCardPositions(initialPositions));
      return;
    }

    // Use requestAnimationFrame to measure after browser has laid out with initial positions
    requestAnimationFrame(() => {
      if (!sidebarRef.current) return;

      const allOrdered = [...comments]
        .sort((a, b) => (commentPositions[a.comment_id] ?? 0) - (commentPositions[b.comment_id] ?? 0));

      const adjusted: Record<string, number> = {};
      let nextAvailableY = 0;

      for (const comment of allOrdered) {
        const el = sidebarRef.current!.querySelector(`#comment-${CSS.escape(comment.comment_id)}`) as HTMLElement;
        const actualHeight = el?.offsetHeight ?? CARD_MIN_HEIGHT;
        const targetY = commentPositions[comment.comment_id] ?? nextAvailableY;
        const y = Math.max(targetY, nextAvailableY);
        adjusted[comment.comment_id] = y;
        nextAvailableY = y + actualHeight + CARD_MIN_GAP;
      }

      setCardPositions(adjusted);
      setTotalHeight(nextAvailableY + 40);
    });
  }, [initialPositions, comments, commentPositions, hasPositions]);

  if (comments.length === 0) {
    return (
      <div className={styles.commentSidebar} data-sidebar>
        <Typography variant="subtitle1" className={styles.sidebarHeader}>
          Comments
        </Typography>
        <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
          No comments yet. Select text to add a comment.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={sidebarRef}
      className={styles.commentSidebar}
      data-sidebar
      style={hasPositions ? { minHeight: totalHeight } : undefined}
    >
      <Typography variant="subtitle1" className={styles.sidebarHeader}>
        Comments
      </Typography>
      {comments.map((comment) => {
        const commenterName = `${comment.reader_first_name} ${comment.reader_last_name}`;
        const isOwnComment = commenterName === readerFullName;
        const isFocused = focusedCommentId === comment.comment_id;
        const posY = cardPositions[comment.comment_id];

        return (
          <div
            key={comment.comment_id}
            id={`comment-${comment.comment_id}`}
            className={`${styles.commentCard} ${comment.resolved ? styles.resolved : ""} ${isFocused ? styles.commentCardFocused : ""}`}
            style={
              hasPositions && posY !== undefined
                ? { position: "absolute", top: posY, left: 16, right: 16 }
                : undefined
            }
          >
            <div className={styles.commentTime}>
              {formatTime(comment.created_at)}
            </div>
            {comment.resolved && (
              <div>
                <Chip label="Acknowledged" size="small" color="success" sx={{ height: 18, fontSize: 10, mb: 0.5 }} />
              </div>
            )}
            {comment.anchor_text_snapshot && (
              <div className={styles.commentSnippet}>
                &ldquo;{comment.anchor_text_snapshot}&rdquo;
              </div>
            )}
            <div className={styles.commentBody}>{comment.body}</div>
            {isOwnComment && !comment.resolved && (
              <div className={styles.commentActions}>
                <Button
                  size="small"
                  color="error"
                  onClick={() => onDelete(comment.comment_id)}
                >
                  Delete
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
