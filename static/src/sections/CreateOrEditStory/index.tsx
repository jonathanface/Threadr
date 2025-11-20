import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Grid2,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState, useCallback, useRef, useEffect } from "react";
import styles from "./createoreditstory.module.css";
import { PortraitDropper } from "../../components/PortraitDropper";
import { useLoader } from "../../hooks/useLoader";
import { useNavigate, useParams } from "react-router-dom";
import { useSelections } from "../../hooks/useSelections";
import { useWorksList } from "../../hooks/useWorksList";
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";
import { api } from "../../api";

interface AvailableSeries {
  series_id?: string;
  series_name: string;
}

interface CreateOrEditStoryForm {
  [key: string]: string | undefined | File | number;
  story_id?: string;
  title?: string;
  description?: string;
  series_id?: string;
  series_title?: string;
  image?: File;
  image_url?: string;
  series_place?: number;
}

//eslint-disable-next-line
const allowedPattern = /^[A-Za-z0-9 +\-\=\.\_\:\,\'\"\/@]*$/;
const isValidTitle = (value: string) => {
  // 1. Max length: 256 characters
  if (value.length > 256) return false;
  if (value.startsWith("aws:")) return false;

  // 2. Check allowed characters
  return allowedPattern.test(value);
};

export const CreateOrEditStory: React.FC = () => {
  const randomImageURL = "https://picsum.photos/300";
  const defaultImageURL = "img/icons/story_standalone_icon.jpg";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageURL, setImageURL] = useState(defaultImageURL);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<AvailableSeries | null>(
    null,
  );
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const tempImageFile = useRef<File>(undefined);
  const defaultImageFetchedRef = useRef(false);
  const initialSeriesID = useRef("");

  const { storyID } = useParams<{ storyID: string }>();
  const { seriesID } = useParams<{ seriesID: string }>();

  const { seriesList, setSeriesList, storiesList, setStoriesList } =
    useWorksList();
  const { propagateSeriesUpdates, propagateStoryUpdates } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const navigate = useNavigate();

  const availableSeries: AvailableSeries[] = seriesList
    ? seriesList.map((series) => {
        return {
          series_id: series.series_id,
          series_name: series.series_title,
        };
      })
    : [];

  const buildFormData = (buildObj: CreateOrEditStoryForm): FormData => {
    const formData = new FormData();
    for (const key in buildObj) {
      if (Object.prototype.hasOwnProperty.call(buildObj, key)) {
        const value = buildObj[key];
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
    return formData;
  };

  const editStory = useCallback(async () => {
    if (!title.trim().length) {
      setAlertState({
        title: "Story title is required",
        message: "",
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }
    if (!isValidTitle(title)) {
      setAlertState({
        title: "Invalid Title",
        message: `A story title must be less than 256 characters and may only contain letters, numbers, spaces, and the following characters: + - = . _ : / @ , ' "`,
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }
    if (!description.trim().length) {
      setAlertState({
        title: "A brief description is required",
        message: "",
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }

    const formData: CreateOrEditStoryForm = {};
    formData.story_id = storyID;
    formData.description = description.trim();
    formData.title = title.trim();
    formData.image = tempImageFile.current;

    if (
      selectedSeries &&
      selectedSeries.series_id?.length &&
      selectedSeries.series_id !== initialSeriesID.current
    ) {
      // we have moved this story a new (but existing) series
      const foundSeries = seriesList?.find(
        (srs) => srs.series_id === selectedSeries.series_id,
      );
      if (foundSeries) {
        formData.series_id = foundSeries.series_id;
        formData.series_name = foundSeries.series_title.trim();
        formData.series_place = foundSeries.stories.length
          ? foundSeries.stories.length
          : 1;
      }
    } else if (selectedSeries && !selectedSeries.series_id) {
      // we are creating a new series
      formData.series_place = 1;
      formData.series_name = selectedSeries?.series_name;
    }

    try {
      showLoader();

      const { data: updatedStory } = await api.put<Story>(
        `/stories/${storyID}/details`,
        buildFormData(formData),
        {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (updatedStory.series_id) {
        const newSeries: Series = {
          series_id: updatedStory.series_id,
          series_title: (formData.series_name as string) || "New Series",
          series_description: "",
          stories: [updatedStory],
          image_url: "/img/icons/story_series_icon.jpg",
        };

        if (seriesList) {
          const foundSeriesIndex = seriesList.findIndex(
            (srs) => srs.series_id === updatedStory.series_id,
          );
          if (foundSeriesIndex !== -1) {
            const updatedSeries = { ...seriesList[foundSeriesIndex] };
            updatedSeries.stories.push(updatedStory);
            propagateSeriesUpdates(updatedSeries, updatedStory);
          } else {
            setSeriesList([...seriesList, newSeries]);
          }
        } else {
          setSeriesList([newSeries]);
        }

        if (storiesList) {
          propagateStoryUpdates(updatedStory);
          const updatedStoriesList = storiesList.filter(
            (story) => story.story_id !== updatedStory.story_id,
          );
          setStoriesList(updatedStoriesList);
        }
      }

      setAlertState({
        title: "Story edit success",
        message: "",
        severity: AlertToastType.success,
        open: true,
      });
      navigate(`/stories/`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText || error.message;
        const payload =
          typeof error.response?.data === "string"
            ? error.response?.data
            : JSON.stringify(error.response?.data || {});
        console.error(`Edit story failed: ${status} ${statusText} ${payload}`);
      } else {
        console.error(error);
      }

      setAlertState({
        title: "Error editing story",
        severity: AlertToastType.error,
        message: "Please try again later or contact support.",
        open: true,
      });
    } finally {
      hideLoader();
    }
  }, [
    description,
    selectedSeries,
    setStoriesList,
    storiesList,
    title,
    hideLoader,
    navigate,
    propagateSeriesUpdates,
    propagateStoryUpdates,
    seriesList,
    setAlertState,
    setSeriesList,
    showLoader,
    storyID,
  ]);

  const saveNewStory = async () => {
    if (!title.trim().length) {
      setAlertState({
        title: "Story title is required",
        message: "",
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }
    if (!isValidTitle(title)) {
      setAlertState({
        title: "Invalid Title",
        message: `A story title must be less than 256 characters and may only contain letters, numbers, spaces, and the following characters: + - = . _ : / @ , ' "`,
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }
    if (!description.trim().length) {
      setAlertState({
        title: "A brief description is required",
        message: "",
        severity: AlertToastType.error,
        open: true,
      });
      return;
    }
    const formData: CreateOrEditStoryForm = {};
    formData.description = description.trim();
    formData.title = title.trim();
    formData.image = tempImageFile.current;

    if (selectedSeries?.series_id) {
      const foundSeries = seriesList?.find(
        (srs) => srs.series_id === selectedSeries.series_id,
      );
      formData.series_id = selectedSeries.series_id;
      if (foundSeries) {
        formData.series_place = foundSeries.stories.length
          ? foundSeries.stories.length
          : 1;
      }
    } else if (selectedSeries?.series_name) {
      const foundSeries = seriesList?.find(
        (srs) => srs.series_title === formData.series_title,
      );
      if (foundSeries) {
        formData.series_id = foundSeries.series_id;
        formData.series_place = foundSeries.stories.length
          ? foundSeries.stories.length
          : 1;
      } else {
        formData.series_title = selectedSeries?.series_name.trim();
        formData.series_place = 1;
      }
    }
    try {
      showLoader();

      const { data: newStory } = await api.post<Story>(
        `/stories`,
        buildFormData(formData),
        {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (newStory.series_id) {
        const newSeries: Series = {
          series_id: newStory.series_id,
          series_title: (formData.series_title as string) || "New Series",
          series_description: "",
          stories: [newStory],
          image_url: "/img/icons/story_series_icon.jpg",
        };

        if (seriesList) {
          const foundSeriesIndex = seriesList.findIndex(
            (srs) => srs.series_id === newStory.series_id,
          );
          if (foundSeriesIndex !== -1) {
            const updatedSeries = { ...seriesList[foundSeriesIndex] };
            updatedSeries.stories.push(newStory);
            propagateSeriesUpdates(updatedSeries, newStory);
          } else {
            setSeriesList([...seriesList, newSeries]);
          }
        } else {
          setSeriesList([newSeries]);
        }
      } else if (storiesList) {
        setStoriesList([...storiesList, newStory]);
      } else {
        setStoriesList([newStory]);
      }

      setAlertState({
        title: "Story creation success",
        message: "",
        severity: AlertToastType.success,
        open: true,
      });
      navigate(`/stories/${newStory.story_id}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Create/edit story failed: ${error.response?.status} ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error(error);
      }
      setAlertState({
        title: "Error creating or editing story",
        severity: AlertToastType.error,
        message: "Please try again later or contact support.",
        open: true,
      });
    } finally {
      hideLoader();
    }
  };

  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("File reading was aborted");
      reader.onerror = () => console.error("File reading has failed");
      reader.onload = () => {
        setImagePreview(URL.createObjectURL(file));
        setImageURL(URL.createObjectURL(file));
        tempImageFile.current = file;
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const getDefaultImageURL = useCallback(async () => {
    try {
      if (!defaultImageFetchedRef.current) {
        defaultImageFetchedRef.current = true;
        showLoader();

        // Use fetch instead of axios for better CORS handling with external resources
        const res = await fetch(randomImageURL);

        if (!res.ok) {
          throw new Error(`Failed to fetch image: ${res.status}`);
        }

        const blob = await res.blob();
        // preserve server-provided type if available, fallback to jpeg
        const fileType = blob.type || "image/jpeg";
        tempImageFile.current = new File([blob], "temp.jpg", {
          type: fileType,
        });

        // Get final URL after redirects
        const finalUrl = res.url || randomImageURL;

        return finalUrl;
      }
      return imageURL;
    } catch (error) {
      console.error(`Error fetching random image:`, error);
      return defaultImageURL;
    } finally {
      hideLoader();
    }
  }, [showLoader, hideLoader, imageURL]);

  useEffect(() => {
    const generateImageURL = async () => {
      const url = await getDefaultImageURL();
      setImageURL(url);
    };
    if (!storyID) {
      generateImageURL();
    }
  }, [getDefaultImageURL, storyID]);

  useEffect(() => {
    if (!storyID || !storyID.length) return;
    const fetchStory = async () => {
      try {
        showLoader();

        const { data } = await api.get<Story>(`/stories/${storyID}`);

        setTitle(data.title);
        setImagePreview(data.image_url);
        setImageURL(data.image_url);
        setDescription(data.description);

        if (data.series_id) {
          initialSeriesID.current = data.series_id;

          const { data: seriesData } = await api.get<Series>(
            `/series/${data.series_id}`,
          );

          setSelectedSeries({
            series_id: seriesData.series_id,
            series_name: seriesData.series_title,
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          console.error(
            `Error retrieving data: ${err.response?.status} ${err.response?.statusText || err.message}`,
          );
        } else {
          console.error(err);
        }
        setAlertState({
          title: "Error retrieving data",
          message:
            "We are experiencing difficulty retrieving some or all of your data",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        hideLoader();
      }
    };
    fetchStory();
  }, [storyID, showLoader, hideLoader, setAlertState]);

  useEffect(() => {
    if (!seriesID || !seriesID.length) return;
    const fetchSeries = async () => {
      try {
        showLoader();

        const { data } = await api.get<Series>(`/series/${seriesID}`);

        setSelectedSeries({
          series_id: seriesID,
          series_name: data.series_title,
        });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          console.error(
            `Error retrieving data: ${err.response?.status} ${err.response?.statusText || err.message}`,
          );
        } else {
          console.error(err);
        }
        setAlertState({
          title: "Error retrieving data",
          message:
            "We are experiencing difficulty retrieving some or all of your data",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        hideLoader();
      }
    };
    fetchSeries();
  }, [seriesID, showLoader, hideLoader, setAlertState]);

  const onImageLoad = (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
  ) => {
    setImagePreview(event.currentTarget.src);
    setIsStoryLoaderVisible(false);
  };

  const buttonLabel = storyID && storyID.length ? "Update" : "Create";
  const buttonFunction = storyID && storyID.length ? editStory : saveNewStory;
  const bigTitle =
    storyID && storyID.length ? "Update a Story" : "Create a Story";

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <>
      <Typography className={styles.storyCreateHeaderText} variant="h5">
        {bigTitle}
      </Typography>
      <Box className={styles.storyContainer}>
        <Box className={styles.header}>
          <IconButton onClick={handleClose} sx={{ mr: 1 }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Grid2 container spacing={3} className={styles.leftPanel}>
          {/* Form Section */}
          <Grid2 className={styles.storyForm}>
            <TextField
              label="Title"
              fullWidth
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              margin="normal"
            />
            <TextField
              label="Write a brief summary of your story"
              fullWidth
              multiline
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              margin="normal"
            />
            <div className={styles.portraitWrapper}>
              <div
                className="loading-screen"
                style={{
                  visibility: isStoryLoaderVisible ? "visible" : "hidden",
                }}
              >
                <Box className="progress-box" />
                <Box className="prog-anim-holder">
                  <CircularProgress />
                </Box>
              </div>
              <PortraitDropper
                imageURL={imageURL}
                name={title}
                onComplete={processImage}
                onImageLoaded={onImageLoad}
              />
            </div>
            <Autocomplete
              options={availableSeries}
              getOptionLabel={(option) => option.series_name}
              value={selectedSeries}
              onInputChange={(_event: React.SyntheticEvent, value: string) => {
                // Find a matching series if it exists.
                const foundSeries = seriesList?.find(
                  (srs: Series) =>
                    srs.series_title.toLowerCase() === value.toLowerCase(),
                );
                if (foundSeries) {
                  setSelectedSeries({
                    series_name: foundSeries.series_title,
                    series_id: foundSeries.series_id,
                  });
                } else {
                  if (value.length) {
                    setSelectedSeries({
                      series_name: value,
                    });
                  }
                }
              }}
              onChange={(_event, newValue) => setSelectedSeries(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assign to Series (optional)"
                  margin="normal"
                />
              )}
            />
            <Button
              variant="contained"
              color="primary"
              style={{ marginTop: 16 }}
              onClick={buttonFunction}
            >
              {buttonLabel}
            </Button>
          </Grid2>

          {/* Preview Section */}
          <Grid2 className={styles.previewCard}>
            <Card>
              {imagePreview && (
                <CardMedia
                  component="img"
                  alt="Story image preview"
                  height="200"
                  image={imagePreview}
                  title="Story Image"
                />
              )}
              <CardContent>
                <Typography className={styles.previewTitle} variant="h5">
                  {title || "Story Title"}
                </Typography>
                <Typography
                  className={styles.previewDescription}
                  variant="body2"
                  color="textSecondary"
                >
                  {description || "Story description will appear here."}
                </Typography>
                {selectedSeries && (
                  <Chip
                    label={selectedSeries.series_name}
                    style={{ marginTop: 8 }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid2>
        </Grid2>
      </Box>
    </>
  );
};
