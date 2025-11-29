import React from "react";
import { Card, CardContent, Chip, Typography, Box, CircularProgress } from "@mui/material";
import { PortraitDropper } from "../../../components/PortraitDropper";
import styles from "../createoreditstory.module.css";

interface AvailableSeries {
  series_id?: string;
  series_name: string;
}

interface StoryPreviewProps {
  title: string;
  description: string;
  imageURL: string;
  selectedSeries: AvailableSeries | null;
  isImageLoading: boolean;
  onImageComplete: (files: File[]) => void;
  onImageLoaded: () => void;
}

export const StoryPreview: React.FC<StoryPreviewProps> = ({
  title,
  description,
  imageURL,
  selectedSeries,
  isImageLoading,
  onImageComplete,
  onImageLoaded,
}) => {
  return (
    <Card role="region" aria-label="Story preview" sx={{ overflow: 'visible' }}>
      <div className={styles.previewImageWrapper}>
        <Typography variant="overline" component="div" sx={{ textAlign: 'center', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px', color: 'var(--text-primary)' }}>
          Story Preview
        </Typography>
        <div
          className="loading-screen"
          style={{
            visibility: isImageLoading ? "visible" : "hidden",
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
      <CardContent>
        <Typography
          className={styles.previewTitle}
          variant="h5"
          component="h2"
          aria-label="Story title preview"
        >
          {title || "Story Title"}
        </Typography>
        <Typography
          className={styles.previewDescription}
          variant="body2"
          color="textSecondary"
          component="p"
          aria-label="Story description preview"
        >
          {description || "Story description will appear here."}
        </Typography>
        {selectedSeries && (
          <Chip
            label={selectedSeries.series_name}
            style={{ marginTop: 8 }}
            size="small"
            aria-label={`Part of series: ${selectedSeries.series_name}`}
          />
        )}
      </CardContent>
    </Card>
  );
};
