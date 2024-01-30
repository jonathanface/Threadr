import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../stores/store";
import { flipCreatingNewStory, pushToStandaloneList } from "../../stores/storiesSlice";
import PortraitDropper from "../portraitdropper/PortraitDropper";

import { Autocomplete, TextField } from "@mui/material";
import { setAlert } from "../../stores/alertSlice";
import { pushToSeriesList, setSeriesList } from "../../stores/seriesSlice";
import { AlertToast, AlertToastType } from "../../utils/Toaster";
import styles from "./createNewStory.module.css";

interface SeriesSelectionOptions {
  label: string;
  id: string;
  count: number;
}

interface CreateStoryForm {
  [key: string]: string | undefined | File | number;
  title?: string;
  description?: string;
  series_id?: string;
  series_title?: string;
  image?: File;
  series_place?: number;
}

const CreateNewStory = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const seriesList = useAppSelector((state) => state.series.seriesList);
  const isCreatingNewStory = useAppSelector((state) => state.stories.isCreatingNew);

  const [imageURL, setImageURL] = useState("");
  const [imageName, setImageName] = useState("Loading...");
  const [isInASeries, setIsInASeries] = useState(false);
  const [seriesDisplayList, setSeriesDisplayList] = useState<SeriesSelectionOptions[]>([]);
  const [storyForm, setStoryForm] = useState<CreateStoryForm | null>(null);

  const defaultImageURL = "img/icons/story_standalone_icon.jpg";

  const attachImageToForm = async () => {
    fetch(imageURL, {
      headers: {
        Accept: "image/*",
      },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const file = new File([blob], "temp" + getBlobExtension(blob.type));
        setStoryForm((prevFormInput) => ({
          ...prevFormInput,
          image: file,
        }));
      })
      .catch((error) => {
        console.error("Fetch operation failed: ", error);
      });
  };

  const getDefaultImage = () => {
    const randomImageURL = "https://picsum.photos/300";
    fetch(randomImageURL)
      .then((response) => {
        if (response.ok) {
          setImageURL(response.url);
        } else {
          setImageURL(defaultImageURL);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const resetForm = () => {
    setImageURL("");
    setImageName("Loading...");
    setIsInASeries(false);
    storyFormMessage.title = "Cannot create story";
    storyFormMessage.message = "";
    storyFormMessage.severity = AlertToastType.error;
    setStoryForm(null);
  };

  const handleClose = () => {
    dispatch(flipCreatingNewStory(null));
    resetForm();
  };

  const onImageLoaded = () => {
    setImageName("New Image");
  };

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

  useEffect(() => {
    if (imageURL.length) {
      attachImageToForm();
    }
  }, [imageURL]);

  useEffect(() => {
    if (isCreatingNewStory) {
      getDefaultImage();
    }

    setSeriesDisplayList(
      seriesList.map((entry) => {
        return {
          label: entry.series_title,
          id: entry.series_id,
          count: entry.stories.length,
        };
      })
    );
  }, [isCreatingNewStory, seriesList]);

  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.error("file reading has failed");
      reader.onload = () => {
        setStoryForm((prevFormInput) => ({
          ...prevFormInput, // spread previous form input
          image: file, // set new image data
        }));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const storyFormMessage: AlertToast = {
    title: "Cannot create story",
    message: "",
    timeout: 6000,
    open: true,
    severity: AlertToastType.error,
    link: undefined,
  };

  const handleSubmit = async () => {
    if (!storyForm) {
      return;
    }
    if (!storyForm.title || !storyForm.title.trim().length) {
      storyFormMessage.message = "Title is required";
      dispatch(setAlert(storyFormMessage));
      return;
    }
    if (!storyForm.description || !storyForm.description.trim().length) {
      storyFormMessage.message = "Description is required";
      dispatch(setAlert(storyFormMessage));
      return;
    }

    if (storyForm.series_id) {
      const foundSeries = seriesList?.find((srs) => srs.series_id === storyForm.series_id);
      if (foundSeries) {
        storyForm.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
      }
    } else if (storyForm.series_title) {
      storyForm.series_place = 1;
    }

    const formData = new FormData();
    for (const key in storyForm) {
      if (storyForm.hasOwnProperty(key)) {
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
      const response = await fetch("/api/stories", {
        credentials: "include",
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error: Error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        throw error;
      }
      const json = await response.json();
      if (json.series_id) {
        const newSeriesList = [...seriesList];
        const foundSeriesIndex = seriesList?.findIndex((srs) => srs.series_id === json.series_id);
        if (foundSeriesIndex !== undefined && foundSeriesIndex >= 0) {
          const updatedSeries = { ...newSeriesList[foundSeriesIndex] };
          updatedSeries.stories = [...updatedSeries.stories, json];
          newSeriesList[foundSeriesIndex] = updatedSeries;
          dispatch(setSeriesList(newSeriesList));
        } else {
          dispatch(
            pushToSeriesList({
              series_id: json.series_id,
              series_title: json.series_title,
              series_description: "",
              stories: [json],
            })
          );
        }
      } else {
        dispatch(pushToStandaloneList(json));
      }
      storyFormMessage.title = "Story creation success";
      storyFormMessage.message = "";
      storyFormMessage.severity = AlertToastType.success;
      dispatch(setAlert(storyFormMessage));
      handleClose();
    } catch (error: any) {
      console.error(error);
      storyFormMessage.message = "Please try again later or contact support at the link below:";
      dispatch(setAlert(storyFormMessage));
    }
  };

  return (
    <Dialog open={isCreatingNewStory} onClose={handleClose} className={styles.storyForm}>
      <DialogTitle>Create a Story</DialogTitle>
      <DialogContent>
        <div className={styles.content}>
          <div className={styles.column + " " + styles.left}>
            <PortraitDropper
              imageURL={imageURL}
              name={imageName}
              onImageLoaded={onImageLoaded}
              onComplete={processImage}
            />
          </div>
          <div className={styles.column + " " + styles.right}>
            <p>
              <label htmlFor="create-story-title">Title:</label>
              <input
                type="text"
                id="create-story-title"
                onChange={(event) => {
                  setStoryForm((prevFormInput) => ({
                    ...prevFormInput,
                    title: event.target.value,
                  }));
                }}
              />
            </p>
            <p>
              <label htmlFor="create-story-description">Description</label>
              <textarea
                spellCheck="false"
                id="create-story-description"
                onChange={(event) => {
                  setStoryForm((prevFormInput) => ({
                    ...prevFormInput,
                    description: event.target.value,
                  }));
                }}
              />
            </p>
          </div>
        </div>
        <div className={styles.seriesBox}>
          <div>
            <input type="checkbox" id="create-story-is-in-series" onChange={() => setIsInASeries(!isInASeries)} />
            <label htmlFor="create-story-is-in-series">This is part of a series</label>
          </div>
          <div>
            {isInASeries ? (
              <div>
                <Autocomplete
                  onInputChange={(event: React.SyntheticEvent, value: string) => {
                    if (event) {
                      const foundSeries = seriesList?.find(
                        (srs) => srs.series_title.toLowerCase() === value.toLowerCase()
                      );
                      if (foundSeries) {
                        setStoryForm((prevFormInput) => ({
                          ...prevFormInput,
                          series_id: foundSeries.series_id,
                          series_title: foundSeries.series_title,
                        }));
                      } else {
                        setStoryForm((prevFormInput) => ({
                          ...prevFormInput,
                          series_id: undefined,
                          series_title: value,
                        }));
                      }
                    }
                  }}
                  onChange={(event: React.SyntheticEvent, value: any) => {
                    if (value.hasOwnProperty("id") && value.hasOwnProperty("label")) {
                      setStoryForm((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: value.id,
                        series_title: value.label,
                      }));
                    }
                  }}
                  freeSolo
                  options={seriesDisplayList}
                  renderInput={(params) => <TextField {...params} label="Series" />}
                />
              </div>
            ) : (
              ""
            )}
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit}>Create</Button>
      </DialogActions>
    </Dialog>
  );
};
export default CreateNewStory;
