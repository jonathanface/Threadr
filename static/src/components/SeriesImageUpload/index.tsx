import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { PortraitDropper } from "../PortraitDropper";
import { Story } from "../../types/Story";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import styles from "./seriesimageupload.module.css";

interface SeriesImageUploadProps {
  imageURL: string;
  name: string;
  stories?: Story[];
  onComplete: (files: File[]) => void;
  onImageLoaded: () => void;
}

const DEFAULT_SERIES_IMAGE = "/img/icons/story_series_icon.jpg";
const acceptedFileTypes = ["png", "jpg", "jpeg", "gif"];

export const SeriesImageUpload: React.FC<SeriesImageUploadProps> = ({
  imageURL,
  name,
  stories,
  onComplete,
  onImageLoaded,
}) => {
  const { setAlertState } = useToaster();
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);

  const hasCustomImage = imageURL && imageURL !== DEFAULT_SERIES_IMAGE;
  const hasStories = stories && stories.length > 0;
  const shouldShowComposite = !hasCustomImage && hasStories && !uploadedImagePreview;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const droppedFile = acceptedFiles[0];
      if (droppedFile.type) {
        if (!acceptedFileTypes.includes(droppedFile.type.split("image/")[1])) {
          setAlertState({
            title: "Cannot upload file",
            message:
              "Only images of the following type are allowed: " +
              acceptedFileTypes.toString(),
            severity: AlertToastType.warning,
            open: true,
            timeout: 10000,
          });
          return;
        }
      }
      // Create preview URL for the uploaded image
      setUploadedImagePreview(URL.createObjectURL(droppedFile));
      onComplete(acceptedFiles);
    },
    [onComplete, setAlertState]
  );

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  // Define this hook before any conditional returns
  const handlePortraitDropperComplete = useCallback(
    (files: File[]) => {
      const droppedFile = files[0];
      setUploadedImagePreview(URL.createObjectURL(droppedFile));
      onComplete(files);
    },
    [onComplete]
  );

  // If we should show composite, render it as a background preview
  if (shouldShowComposite) {
    const storyImages = stories!.slice(0, 4);
    const imageCount = storyImages.length;

    return (
      <div className={styles.uploadWrapper}>
        <div
          className={`${styles.compositeBackground} ${styles[`count${imageCount}`]}`}
        >
          {storyImages.map((story) => (
            <div
              key={story.story_id}
              className={styles.compositeImage}
              style={{ backgroundImage: `url(${story.image_url})` }}
            />
          ))}
        </div>
        <div className={styles.uploaderOverlay} {...getRootProps()}>
          <input {...getInputProps()} />
        </div>
        <div className={styles.uploadHint}>Click or drag to upload series image</div>
      </div>
    );
  }

  // Otherwise just show normal PortraitDropper

  return (
    <PortraitDropper
      imageURL={uploadedImagePreview || imageURL}
      name={name}
      onImageLoaded={onImageLoaded}
      onComplete={handlePortraitDropperComplete}
    />
  );
};
