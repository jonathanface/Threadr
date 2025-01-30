import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React, { useCallback, useEffect, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import styles from "./createEditStoryPanel.module.css";
import { useToaster } from "../../hooks/useToaster";
import { AlertCommandType, AlertState, AlertToastType } from "../../types/AlertToasts";
import { useLoader } from "../../hooks/useLoader";
import { Story } from "../../types/Story";
import { PortraitDropper } from "../../components/PortraitDropper";
import { Series } from "../../types/Series";
import { APIError } from "../../types/API";

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

interface CreateEditStoryPanelProps {
  seriesList: Series[] | null;
  setSeriesList: (series: Series[]) => void
  storiesList: Story[] | null;
  setStoriesList: (series: Story[]) => void
}

export const CreatEditStoryPanel = (props: CreateEditStoryPanelProps) => {
  const { setAlertState } = useToaster();
  const { setIsLoaderVisible } = useLoader();

  const [imageURL, setImageURL] = useState("");
  const [imageName, setImageName] = useState("Loading...");
  const [isInASeries, setIsInASeries] = useState(false);
  const [seriesDisplayList, setSeriesDisplayList] = useState<SeriesSelectionOptions[]>([]);
  const [storyForm, setStoryForm] = useState<CreateStoryForm | null>(null);

  const defaultImageURL = "img/icons/story_standalone_icon.jpg";

  const attachImageToForm = useCallback(async () => {
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
  }, [imageURL]);

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
    //dispatch(setStoryBelongsToSeries(false));
    storyFormMessage.title = "Cannot create story";
    storyFormMessage.message = "";
    storyFormMessage.severity = AlertToastType.error;
    setStoryForm(null);
  };

  const handleClose = () => {
    // setIsCreatingStory(false);
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
  }, [imageURL, attachImageToForm]);

  // useEffect(() => {
  //   if (isCreatingStory) {
  //     getDefaultImage();
  //   }
  //   if (storyPreassignSeriesID !== "") {
  //     setIsInASeries(true);
  //   }

  //   setSeriesDisplayList(
  //     props.seriesList?.map((entry) => {
  //       return {
  //         label: entry.series_title,
  //         id: entry.series_id,
  //         count: entry.stories.length,
  //       };
  //     }) || []
  //   );
  // }, [isCreatingStory, props.seriesList, storyPreassignSeriesID]);

  useEffect(() => {

  }, []);

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

  const storyFormMessage: AlertState = {
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
      setAlertState(storyFormMessage);
      return;
    }
    if (!storyForm.description || !storyForm.description.trim().length) {
      storyFormMessage.message = "Description is required";
      setAlertState(storyFormMessage);
      return;
    }

    if (storyForm.series_id) {
      const foundSeries = props.seriesList?.find((srs) => srs.series_id === storyForm.series_id);
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
    setIsLoaderVisible(true);
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
        error.name = response.status.toString();
        throw error;
      }
      const json = await response.json();
      if (json.series_id) {
        const newSeriesList = props.seriesList ? [...props.seriesList] : [];
        const foundSeriesIndex = props.seriesList?.findIndex((srs) => srs.series_id === json.series_id);
        if (foundSeriesIndex !== undefined && foundSeriesIndex >= 0) {
          const updatedSeries = { ...newSeriesList[foundSeriesIndex] };
          updatedSeries.stories = [...updatedSeries.stories, json];
          newSeriesList[foundSeriesIndex] = updatedSeries;
          props.setSeriesList(newSeriesList);
        } else {
          newSeriesList.push({
            series_id: json.series_id,
            series_title: storyForm.series_title ? storyForm.series_title : "New Series",
            series_description: "",
            stories: [json],
            image_url: "/img/icons/story_series_icon.jpg",
          })
        }
      } else {
        const story = json as Story;
        const newStoriesList = props.storiesList ? props.storiesList : [];
        newStoriesList.push(story);
        props.setStoriesList(newStoriesList);
      }
      storyFormMessage.title = "Story creation success";
      storyFormMessage.message = "";
      storyFormMessage.severity = AlertToastType.success;
      setAlertState(storyFormMessage)
      handleClose();
    } catch (error: unknown) {
      console.error(error);
      const apiError = error as APIError;
      if (apiError.statusCode === 401) {
        storyFormMessage.title = "Insufficient subscription";
        storyFormMessage.severity = AlertToastType.warning;
        storyFormMessage.message =
          "Non-subscribers are limited to just one story. You may click the link below if you want to subscribe.";
        storyFormMessage.callback = {
          type: AlertCommandType.subscribe,
          text: "subscribe",
        };
      } else {
        storyFormMessage.message = "Please try again later or contact support at the link below:";
      }
      setAlertState(storyFormMessage);
    } finally {
      setIsLoaderVisible(false);
    }
  };

  return (
    <Dialog open={false} onClose={handleClose} className={styles.storyForm}>
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
                onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  setStoryForm((prevFormInput) => ({
                    ...prevFormInput,
                    title: (event.target as HTMLInputElement).value,
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
            <input
              type="checkbox"
              id="create-story-is-in-series"
              checked={isInASeries}
              onChange={() => setIsInASeries(!isInASeries)}
            />
            <label htmlFor="create-story-is-in-series">This is part of a series</label>
          </div>
          <div>
            {isInASeries ? (
              <div>
                <Autocomplete
                  defaultValue={storyForm?.series_title}
                  onInputChange={(event: React.SyntheticEvent, value: string) => {
                    if (event) {
                      const foundSeries = props.seriesList?.find(
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(event: React.SyntheticEvent, value: any) => {
                    if (Object.prototype.hasOwnProperty.call(value, 'id') && Object.prototype.hasOwnProperty.call(value, 'label')) {
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
