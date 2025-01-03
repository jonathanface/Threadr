import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../stores/store";
import {
  flipEditingStory,
  setStandaloneList,
  setStoryBeingEdited,
} from "../../stores/storiesSlice";
import { PortraitDropper } from "../PortraitDropper";

import { Autocomplete, TextField } from "@mui/material";
import { setAlert } from "../../stores/alertSlice";
import { pushToSeriesList, setSeriesList } from "../../stores/seriesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import styles from "./editStory.module.css";
import { useCurrentStoryContext } from "../../contexts/selections";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";

interface SeriesSelectionOption {
  label: string;
  id: string;
  count: number;
}

interface EditStoryForm {
  [key: string]: string | undefined | File | number;
  title?: string;
  description?: string;
  series_id?: string;
  series_title?: string;
  image?: File;
  series_place?: number;
}

export const EditStoryModal = () => {
  const { setAlertState } = useToaster();

  const { currentStory } = useCurrentStoryContext();

  // const seriesList = useAppSelector((state) => state.series.seriesList);
  // const standaloneList = useAppSelector(
  //   (state) => state.stories.standaloneList
  // );
  // const isEditingStory = useAppSelector(
  //   (state) => state.stories.isEditingStory
  // );

  const [imageURL, setImageURL] = useState(
    currentStory?.image_url ? currentStory.image_url : ""
  );
  const [imageName, setImageName] = useState(
    currentStory?.title ? currentStory.title : ""
  );
  const [isInASeries, setIsInASeries] = useState(false);
  const [preselectedTitle, setPreselectedTitle] = useState(
    currentStory?.title ? currentStory.title : ""
  );
  const [preselectedDescription, setPreselectedDescription] = useState(
    currentStory?.description ? currentStory.description : ""
  );
  const [preselectedSeries, setPreselectedSeries] =
    useState<SeriesSelectionOption | null>(null);
  const [seriesDisplayList, setSeriesDisplayList] = useState<
    SeriesSelectionOption[]
  >([]);
  const [storyForm, setStoryForm] = useState<EditStoryForm | null>(null);

  const resetForm = () => {
    setImageURL("");
    setImageName("Loading...");
    setIsInASeries(false);
    setPreselectedTitle("");
    setPreselectedDescription("");
    setPreselectedSeries(null);
    setStoryForm(null);
  };

  const handleClose = () => {
    //dispatch(setStoryBeingEdited(null));
    //dispatch(flipEditingStory(null));
    resetForm();
  };

  const onImageLoaded = () => {
    setImageName("New Image");
  };

  // const getBlobExtension = (mimeType: string) => {
  //   switch (mimeType) {
  //     case "image/jpeg":
  //       return ".jpg";
  //     case "image/png":
  //       return ".png";
  //     case "image/gif":
  //       return ".gif";
  //     default:
  //       return "";
  //   }
  // };

  useEffect(() => {
    if (!currentStory) return;
    if (currentStory.image_url && currentStory.image_url !== imageURL) {
      setImageURL(currentStory.image_url);
    }

    if (currentStory.title !== preselectedTitle) {
      setPreselectedTitle(currentStory.title);
    }
    if (currentStory.description !== preselectedDescription) {
      setPreselectedDescription(currentStory.description);
    }
    setStoryForm({
      title: currentStory.title,
      description: currentStory.description,
    });
  }, [currentStory, imageURL, preselectedDescription, preselectedTitle]);

  useEffect(() => {
    if (!currentStory) return;
    if (currentStory.series_id) {
      const foundSeries = seriesList?.find(
        (srs) => srs.series_id === currentStory?.series_id
      );
      if (foundSeries) {
        setStoryForm((prevFormInput) => ({
          ...prevFormInput,
          series_id: foundSeries.series_id,
          series_title: foundSeries.series_title,
        }));
        const entry: SeriesSelectionOption = {
          label: foundSeries.series_title,
          id: foundSeries.series_id,
          count: 0,
        };
        setPreselectedSeries(entry);
        setIsInASeries(false);
      }
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
  }, [isEditingStory, seriesList, currentStory?.series_id]);

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

  setAlertState({
    title: "Cannot edit story",
    message: "",
    open: true,
    severity: AlertToastType.warning,
  });

  const handleSubmit = async () => {
    if (!storyForm || !currentStory) return;

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

    if (
      storyForm.series_id !== props.story.series_id &&
      storyForm.series_id !== null
    ) {
      const foundSeries = seriesList?.find(
        (srs) => srs.series_id === storyForm.series_id
      );
      if (foundSeries) {
        storyForm.series_place = foundSeries.stories.length
          ? foundSeries.stories.length
          : 1;
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

    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch(
        "/api/stories/" + props.story.story_id + "/details",
        {
          credentials: "include",
          method: "PUT",
          body: formData,
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        const error: Error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        throw error;
      }
      const json = await response.json();
      if (json.series_id && json.series_id !== props.story.series_id) {
        // this story was a standalone and has been added to a series
        const newSeriesList = [...seriesList];
        const foundSeriesIndex = seriesList?.findIndex(
          (srs) => srs.series_id === json.series_id
        );
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
      } else if (
        !json.series_id &&
        props.story &&
        props.story.series_id !== null
      ) {
        // this story has been removed from a series
        const newSeriesList = [...seriesList];
        const foundSeriesIndex = seriesList?.findIndex(
          (srs) => srs.series_id === props.story?.series_id
        );
        if (foundSeriesIndex !== undefined && foundSeriesIndex >= 0) {
          const updatedSeries = { ...newSeriesList[foundSeriesIndex] };
          const foundStoryIndex = updatedSeries.stories.findIndex(
            (stry) => stry.story_id === json.story_id
          );
          updatedSeries.stories = updatedSeries.stories.splice(
            foundStoryIndex,
            1
          );
          newSeriesList[foundSeriesIndex] = updatedSeries;
          dispatch(setSeriesList(newSeriesList));
        }
      }
      const foundStoryIndex = standaloneList.findIndex(
        (stry) => stry.story_id === json.story_id
      );
      const newStandaloneList = [...standaloneList];
      newStandaloneList[foundStoryIndex] = json;
      dispatch(setStandaloneList(newStandaloneList));
      storyFormMessage.title = "Story edited successfully";
      storyFormMessage.message = "";
      storyFormMessage.severity = AlertToastType.success;
      dispatch(setAlert(storyFormMessage));
      handleClose();
    } catch (error: unknown) {
      console.error(error);
      storyFormMessage.message =
        "Please try again later or contact support at the link below:";
      dispatch(setAlert(storyFormMessage));
    }
    dispatch(setIsLoaderVisible(false));
  };

  return (
    <Dialog
      open={isEditingStory}
      onClose={handleClose}
      className={styles.editStoryForm}
    >
      <DialogTitle>{"Editing " + preselectedTitle}</DialogTitle>
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
              <label htmlFor="edit-story-title">Title:</label>
              <input
                defaultValue={preselectedTitle}
                type="text"
                id="edit-story-title"
                onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  setStoryForm((prevFormInput) => ({
                    ...prevFormInput,
                    title: (event.target as HTMLInputElement).value,
                  }));
                }}
              />
            </p>
            <p>
              <label htmlFor="edit-story-description">Description</label>
              <textarea
                defaultValue={preselectedDescription}
                spellCheck="false"
                id="edit-story-description"
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
              id="edit-story-is-in-series"
              onChange={() => setIsInASeries(!isInASeries)}
            />
            <label htmlFor="edit-story-is-in-series">
              This is part of a series
            </label>
          </div>
          <div>
            {isInASeries ? (
              <div>
                <Autocomplete
                  onInputChange={(
                    event: React.SyntheticEvent,
                    value: string
                  ) => {
                    if (event) {
                      const foundSeries = seriesList?.find(
                        (srs) =>
                          srs.series_title.toLowerCase() === value.toLowerCase()
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
                  onChange={(
                    _event: React.SyntheticEvent,
                    value: string | SeriesSelectionOption | null
                  ) => {
                    const toSeries = value as SeriesSelectionOption;
                    if (toSeries) {
                      setStoryForm((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: toSeries.id,
                        series_title: toSeries.label,
                      }));
                    }
                  }}
                  freeSolo
                  options={seriesDisplayList}
                  value={preselectedSeries}
                  renderInput={(params) => (
                    <TextField {...params} label="Series" />
                  )}
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
        <Button onClick={handleSubmit}>Update</Button>
      </DialogActions>
    </Dialog>
  );
};
