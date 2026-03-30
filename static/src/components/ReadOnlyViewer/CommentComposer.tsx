import { useState } from "react";
import { Button } from "@mui/material";
import styles from "./readonlyviewer.module.css";

interface CommentComposerProps {
  selectedText: string;
  readerName: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export const CommentComposer = ({
  selectedText,
  readerName,
  onSubmit,
  onCancel,
}: CommentComposerProps) => {
  const [body, setBody] = useState("");

  const handleSubmit = () => {
    if (!body.trim()) return;
    onSubmit(body.trim());
    setBody("");
  };

  return (
    <div className={styles.composerOverlay}>
      <div className={styles.commentSnippet}>
        &ldquo;{selectedText.slice(0, 100)}
        {selectedText.length > 100 ? "..." : ""}&rdquo;
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
        Commenting as <strong>{readerName}</strong>
      </div>
      <textarea
        className={styles.composerTextarea}
        placeholder="Write your comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        autoFocus
      />
      <div className={styles.composerActions}>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSubmit}
          disabled={!body.trim()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
};
