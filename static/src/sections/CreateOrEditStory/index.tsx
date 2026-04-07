import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useRef, useEffect, useState } from "react";
import styles from "./createoreditstory.module.css";
import { useNavigate, useParams } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useWorksList } from "../../hooks/useWorksList";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";
import { api } from "../../api";
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";

// Import new hooks and components
import { useStoryForm } from "./hooks/useStoryForm";
import { useStoryImage } from "./hooks/useStoryImage";
import { useStorySave } from "./hooks/useStorySave";
import { StoryFormFields } from "./components/StoryFormFields";
import { StorySeriesSelector } from "./components/StorySeriesSelector";
import { StoryPreview } from "./components/StoryPreview";
import { DocumentImporter } from "./components/DocumentImporter";

export const CreateOrEditStory: React.FC = () => {
  const { storyID } = useParams<{ storyID: string }>();
  const { seriesID } = useParams<{ seriesID: string }>();
  const navigate = useNavigate();
  const initialSeriesID = useRef("");

  const { seriesList } = useWorksList();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();

  // Use custom hooks
  const {
    title,
    description,
    selectedSeries,
    validationErrors,
    isDirty,
    handleTitleChange,
    handleDescriptionChange,
    handleSeriesChange,
    validate,
    setFormData,
  } = useStoryForm();

  const {
    imageURL,
    isImageLoading,
    tempImageFile,
    processImage,
    getRandomImageURL,
    setImage,
    onImageLoad,
  } = useStoryImage();

  const { saveStory } = useStorySave();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [skipFirstPage, setSkipFirstPage] = useState(false);

  // Fetch existing story data for edit mode
  useEffect(() => {
    if (!storyID) return;

    const fetchStory = async () => {
      try {
        showLoader();
        const { data } = await api.get<Story>(`/stories/${storyID}`);

        setFormData({
          title: data.title,
          description: data.description,
        });
        setImage(data.image_url);

        if (data.series_id) {
          initialSeriesID.current = data.series_id;
          const { data: seriesData } = await api.get<Series>(
            `/series/${data.series_id}`
          );
          setFormData({
            series: {
              series_id: seriesData.series_id,
              series_name: seriesData.series_title,
            },
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          console.error(
            `Error retrieving data: ${err.response?.status} ${err.response?.statusText || err.message}`
          );
        } else {
          console.error(err);
        }
        setAlertState({
          title: "Error retrieving story data",
          message: "We are experiencing difficulty retrieving your data",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        hideLoader();
      }
    };

    fetchStory();
  }, [storyID, showLoader, hideLoader, setAlertState, setFormData, setImage]);

  // Fetch series data if creating from series page
  useEffect(() => {
    if (!seriesID) return;

    const fetchSeries = async () => {
      try {
        showLoader();
        const { data } = await api.get<Series>(`/series/${seriesID}`);
        setFormData({
          series: {
            series_id: seriesID,
            series_name: data.series_title,
          },
        });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          console.error(
            `Error retrieving series: ${err.response?.status} ${err.response?.statusText || err.message}`
          );
        } else {
          console.error(err);
        }
        setAlertState({
          title: "Error retrieving series data",
          message: "We are experiencing difficulty retrieving the series",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        hideLoader();
      }
    };

    fetchSeries();
  }, [seriesID, showLoader, hideLoader, setAlertState, setFormData]);

  // Generate random image for new stories
  useEffect(() => {
    if (!storyID) {
      getRandomImageURL().then((url) => setImage(url));
    }
  }, [storyID, getRandomImageURL, setImage]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!validate()) {
      // Show first validation error
      if (validationErrors.length > 0) {
        setAlertState({
          title: validationErrors[0].message,
          message: "",
          severity: AlertToastType.error,
          open: true,
        });
      }
      return;
    }

    await saveStory({
      storyID,
      title,
      description,
      imageFile: tempImageFile.current,
      importFile: importFile || undefined,
      skipFirstPage,
      selectedSeries,
      initialSeriesID: initialSeriesID.current,
    });
  }, [
    validate,
    validationErrors,
    saveStory,
    storyID,
    title,
    description,
    tempImageFile,
    importFile,
    selectedSeries,
    setAlertState,
  ]);

  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to leave?"
      );
      if (!confirmed) return;
    }
    navigate(-1);
  };

  const isEdit = Boolean(storyID);
  const buttonLabel = isEdit ? "Update Story" : "Create Story";
  const pageTitle = isEdit ? "Update a Story" : "Create a Story";

  const titleError = validationErrors.find((e) => e.field === "title")?.message;
  const descError = validationErrors.find(
    (e) => e.field === "description"
  )?.message;

  return (
    <Box className={styles.storyContainer}>
      <Box className={styles.header}>
        <Tooltip title="Close" placement="left">
          <IconButton
            onClick={handleClose}
            sx={{ mr: 1 }}
            aria-label="Close and return"
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography
        className={styles.storyCreateHeaderText}
        variant="h5"
        component="h1"
      >
        {pageTitle}
      </Typography>

      <Box className={styles.leftPanel}>
          {/* Form Section */}
          <Box className={styles.storyForm}>
            <StoryFormFields
              title={title}
              description={description}
              onTitleChange={handleTitleChange}
              onDescriptionChange={handleDescriptionChange}
              titleError={titleError}
              descriptionError={descError}
            />

            {!isEdit && (
              <DocumentImporter
                importFile={importFile}
                onFileSelected={setImportFile}
                skipFirstPage={skipFirstPage}
                onSkipFirstPageChange={setSkipFirstPage}
              />
            )}

            {seriesList && (
              <StorySeriesSelector
                seriesList={seriesList}
                selectedSeries={selectedSeries}
                onSeriesChange={handleSeriesChange}
              />
            )}

            <Button
              variant="contained"
              color="primary"
              style={{ marginTop: 16 }}
              onClick={handleSave}
              aria-label={buttonLabel}
            >
              {buttonLabel}
            </Button>
          </Box>

          {/* Preview Section */}
          <Box className={styles.previewCard}>
            <StoryPreview
              title={title}
              description={description}
              imageURL={imageURL}
              selectedSeries={selectedSeries}
              isImageLoading={isImageLoading}
              onImageComplete={processImage}
              onImageLoaded={onImageLoad}
            />
          </Box>
        </Box>
      </Box>
  );
};
