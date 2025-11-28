import React from "react";
import { Box, CircularProgress } from "@mui/material";
import { PortraitDropper } from "../../../components/PortraitDropper";
import styles from "../createoreditstory.module.css";

interface StoryImageUploadProps {
  imageURL: string;
  title: string;
  isLoading: boolean;
  onImageComplete: (files: File[]) => void;
  onImageLoaded: () => void;
}

export const StoryImageUpload: React.FC<StoryImageUploadProps> = ({
  imageURL,
  title,
  isLoading,
  onImageComplete,
  onImageLoaded,
}) => {
  return (
    <div className={styles.portraitWrapper}>
      <div
        className="loading-screen"
        style={{
          visibility: isLoading ? "visible" : "hidden",
        }}
        role="status"
        aria-live="polite"
        aria-label="Loading image"
      >
        <Box className="progress-box" />
        <Box className="prog-anim-holder">
          <CircularProgress aria-label="Loading" />
        </Box>
      </div>
      <PortraitDropper
        imageURL={imageURL}
        name={title || "Story cover image"}
        onComplete={onImageComplete}
        onImageLoaded={onImageLoaded}
      />
    </div>
  );
};
