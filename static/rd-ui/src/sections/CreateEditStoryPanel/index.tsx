import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Typography,
} from "@mui/material";
import { useToaster } from "../../hooks/useToaster";
import { AlertCommandType, AlertState, AlertToastType } from "../../types/AlertToasts";
import { useLoader } from "../../hooks/useLoader";
import { APIError } from "../../types/API";
import { useWorksList } from "../../hooks/useWorksList";
import { useMatch, useNavigate } from "react-router-dom";
import styles from "./createEditStoryPanel.module.css";
import { StoryImageSection } from "./StoryImageSection";
import { SeriesSelectionOptions, StoryDetailsSection } from "./StoryDetailsSection";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

interface CreateStoryForm {
  [key: string]: string | undefined | File | number;
  title?: string;
  description?: string;
  series_id?: string;
  series_title?: string;
  image?: File;
  series_place?: number;
}

export const CreateEditStoryPanel = () => {
  const { setAlertState } = useToaster();
  const { showLoader, hideLoader } = useLoader();
  const { seriesList, storiesList, setSeriesList, setStoriesList } = useWorksList();

  const [imageURL, setImageURL] = useState<string | null>(null);
  const [imageName, setImageName] = useState("Loading...");
  const [isInASeries, setIsInASeries] = useState(false);
  const [seriesDisplayList, setSeriesDisplayList] = useState<SeriesSelectionOptions[]>([]);
  const [storyForm, setStoryForm] = useState<CreateStoryForm>({});
  const defaultImageFetchedRef = useRef(false);
  const match = useMatch("/stories/:lastPart");
  const navigate = useNavigate();

  // ---------------------------
  // Image and Blob Handlers
  // ---------------------------
  const getBlobExtension = (mimeType: string) => {
    switch (mimeType) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/gif":
        return ".gif";
      default:
        return "";
    }
  };

  const attachImageToForm = useCallback(async () => {
    if (!imageURL) return;
    try {
      showLoader();
      const response = await fetch(imageURL, {
        headers: { Accept: "image/*" },
      });
      if (!response.ok) throw new Error(response.statusText);
      const blob = await response.blob();
      const file = new File([blob], "temp" + getBlobExtension(blob.type));
      setStoryForm((prev) => ({ ...prev, image: file }));
    } catch (error: unknown) {
      console.error("Image fetch operation failed: ", error);
    } finally {
      hideLoader();
    }
  }, [imageURL, showLoader, hideLoader]);

  const randomImageURL = "https://picsum.photos/300";
  const defaultImageURL = "img/icons/story_standalone_icon.jpg";
  const lastPart = match?.params.lastPart;

  const getDefaultImageURL = useCallback(async () => {
    try {
      showLoader();
      const response = await fetch(randomImageURL);
      if (!response.ok) throw new Error(response.statusText);
      return response.url;
    } catch (error) {
      console.error(`Error fetching random image: ${error}`);
      return defaultImageURL;
    } finally {
      hideLoader();
    }
  }, [showLoader, hideLoader]);

  // Effect to fetch default image URL once if needed.
  useEffect(() => {
    const generateImageURL = async () => {
      const url = await getDefaultImageURL();
      setImageURL(url);
    };
    if (lastPart === "new" && !defaultImageFetchedRef.current) {
      defaultImageFetchedRef.current = true;
      generateImageURL();
    }
    setSeriesDisplayList(
      seriesList ? seriesList.map((entry) => {
        return {
          label: entry.series_title,
          id: entry.series_id,
          count: entry.stories.length,
        };
      }) : []
    );
  }, [lastPart, getDefaultImageURL, seriesList]);

  // Effect to attach image to form—but only if we haven't already attached it.
  useEffect(() => {
    if (imageURL?.length && !storyForm.image) {
      attachImageToForm();
    }
  }, [imageURL, attachImageToForm, storyForm.image]);



  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("File reading was aborted");
      reader.onerror = () => console.error("File reading has failed");
      reader.onload = () => {
        setStoryForm((prev) => ({ ...prev, image: file }));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // ---------------------------
  // Alert Message Factory
  // ---------------------------
  const getStoryFormMessage = (overrides?: Partial<AlertState>): AlertState => ({
    title: "Cannot create story",
    message: "",
    timeout: 6000,
    open: true,
    severity: AlertToastType.error,
    link: undefined,
    ...overrides,
  });

  // ---------------------------
  // Form Reset / Close Handler
  // ---------------------------
  const resetForm = () => {
    setImageURL(null);
    setImageName("Loading...");
    setIsInASeries(false);
    setStoryForm({});
    defaultImageFetchedRef.current = false; // Reset the flag if needed
  };
  const handleClose = () => {
    resetForm();
  };

  // ---------------------------
  // Input Handlers
  // ---------------------------
  const handleTitleChange = (value: string) => {
    setStoryForm((prev) => ({ ...prev, title: value }));
  };
  const handleDescriptionChange = (value: string) => {
    setStoryForm((prev) => ({ ...prev, description: value }));
  };
  const handleToggleSeries = () => {
    setIsInASeries((prev) => !prev);
  };
  const handleSeriesChange = (value: string, seriesId?: string) => {
    setStoryForm((prev) => ({
      ...prev,
      series_title: value,
      series_id: seriesId,
    }));
  };

  const onImageLoaded = () => {
    setImageName("New Image");
  };

  // ---------------------------
  // Form Submission
  // ---------------------------
  const handleSubmit = async () => {
    if (!storyForm.title || !storyForm.title.trim().length) {
      setAlertState(getStoryFormMessage({ message: "Title is required" }));
      return;
    }
    if (!storyForm.description || !storyForm.description.trim().length) {
      setAlertState(getStoryFormMessage({ message: "Description is required" }));
      return;
    }

    // Set series_place if needed.
    if (storyForm.series_id) {
      const foundSeries = seriesList?.find((srs: any) => srs.series_id === storyForm.series_id);
      if (foundSeries) {
        storyForm.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
      }
    } else if (storyForm.series_title) {
      storyForm.series_place = 1;
    }

    const formData = new FormData();
    for (const key in storyForm) {
      if (Object.prototype.hasOwnProperty.call(storyForm, key)) {
        const value = storyForm[key];
        if (value === undefined) continue;
        if (typeof value === "string" || typeof value === "number") {
          formData.append(key, value.toString());
          continue;
        }
        if (value instanceof File) {
          formData.append("file", value);
        }
      }
    }

    try {
      showLoader();
      const response = await fetch("/api/stories", {
        credentials: "include",
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error: Error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        error.name = response.status.toString();
        throw error;
      }
      const json = await response.json();
      // Update series or stories list.
      if (json.series_id) {
        const newSeriesList = seriesList ? [...seriesList] : [];
        const foundSeriesIndex = seriesList?.findIndex((srs: any) => srs.series_id === json.series_id);
        if (foundSeriesIndex !== undefined && foundSeriesIndex >= 0) {
          const updatedSeries = { ...newSeriesList[foundSeriesIndex] };
          updatedSeries.stories = [...updatedSeries.stories, json];
          newSeriesList[foundSeriesIndex] = updatedSeries;
          setSeriesList(newSeriesList);
        } else {
          newSeriesList.push({
            series_id: json.series_id,
            series_title: storyForm.series_title ? storyForm.series_title : "New Series",
            series_description: "",
            stories: [json],
            image_url: "/img/icons/story_series_icon.jpg",
          });
        }
      } else {
        const story = json;
        const newStoriesList = storiesList ? storiesList : [];
        newStoriesList.push(story);
        setStoriesList(newStoriesList);
      }
      setAlertState(
        getStoryFormMessage({
          message: "",
          title: "Story creation success",
          severity: AlertToastType.success,
        })
      );
      handleClose();
    } catch (error: unknown) {
      console.error(error);
      const apiError = error as APIError;
      if (apiError.statusCode === 401) {
        setAlertState(
          getStoryFormMessage({
            message:
              "Non-subscribers are limited to just one story. You may click the link below if you want to subscribe.",
            title: "Insufficient subscription",
            severity: AlertToastType.warning,
            callback: { type: AlertCommandType.subscribe, text: "subscribe" },
          })
        );
      } else {
        setAlertState(
          getStoryFormMessage({
            message: "Please try again later or contact support at the link below:",
          })
        );
      }
    } finally {
      hideLoader();
    }
  };

  const handleBack = () => {
    // Use navigate(-1) to go back in history or navigate("/some-route") to go to a specific route.
    navigate('/stories');
  };

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <Box className={styles.storyForm} >
      <Box className={styles.header}>
        <IconButton onClick={handleBack} sx={{ mr: 1 }}>
          <ArrowBackIosIcon />
        </IconButton>
        <Typography variant="h5">Create a Story</Typography>
      </Box>
      <Box className={styles.content}>
        <StoryImageSection
          imageURL={imageURL}
          imageName={imageName}
          onImageLoaded={onImageLoaded}
          processImage={processImage}
        />
        <StoryDetailsSection
          onTitleChange={handleTitleChange}
          onDescriptionChange={handleDescriptionChange}
          isInASeries={isInASeries}
          seriesDisplayList={seriesDisplayList}
          seriesList={seriesList}
          onToggleSeries={handleToggleSeries}
          onSeriesChange={handleSeriesChange}
          defaultSeriesTitle={storyForm.series_title}
        />
      </Box>
      <Box className={styles.controls}>
        <Button onClick={handleSubmit}>Create</Button>
      </Box>
    </Box>
  );
};
