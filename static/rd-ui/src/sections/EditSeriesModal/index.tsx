import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import RemoveIcon from "@mui/icons-material/Remove";
import { IconButton } from "@mui/material";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React, { useEffect, useState } from "react";
import { DragDropContext, Draggable, DropResult, Droppable } from "react-beautiful-dnd";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { flipEditingSeries, setSeriesBeingEdited, setSeriesList } from "../../stores/seriesSlice";
import { AppDispatch, RootState } from "../../stores/store";
import {
  flipCreatingNewStory,
  flipEditingStory,
  setStandaloneList,
  setStoryBeingEdited,
} from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { Series, Story } from "../../types";
import { AlertToast, AlertToastType } from "../../utils/Toaster";
import PortraitDropper from "../PortraitDropper";
import styles from "./edit-series.module.css";

interface EditSeriesForm {
  [key: string]: string | undefined | File | number | Story[];
  title?: string;
  description?: string;
  series_id?: string;
  series_title?: string;
  stories?: Story[];
  image?: File;
  series_place?: number;
}
interface EditSeriesProps {
  series: Series | null;
}

const EditSeriesModal = (props: EditSeriesProps) => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const isEditingSeries = useAppSelector((state) => state.series.isEditingSeries);
  const seriesList = useAppSelector((state) => state.series.seriesList);
  const standaloneList = useAppSelector((state) => state.stories.standaloneList);

  const [seriesEntries, setSeriesEntries] = useState<Story[] | null>(null);
  const [seriesEditForm, setSeriesEditForm] = useState<EditSeriesForm | null>(null);

  const [preselectedTitle, setPreselectedTitle] = useState(props.series?.title ? props.series.title : "");
  const [preselectedDescription, setPreselectedDescription] = useState(
    props.series?.description ? props.series.description : ""
  );
  const [imageURL, setImageURL] = useState("");
  const [imageName, setImageName] = useState("Loading...");

  const seriesFormMessage: AlertToast = {
    title: "Cannot edit series",
    message: "",
    timeout: 6000,
    open: true,
    severity: AlertToastType.error,
    link: undefined,
  };

  const resetForm = () => {
    seriesFormMessage.title = "Cannot edit series";
    seriesFormMessage.message = "";
    seriesFormMessage.severity = AlertToastType.error;
    setPreselectedDescription("");
    setPreselectedTitle("");
    setImageURL("");
    setImageName("Loading...");
  };

  const handleClose = () => {
    dispatch(flipEditingSeries());
    // resetForm();
  };

  useEffect(() => {
    if (props.series) {
      if (props.series.stories) {
        const stories = props.series.stories.slice();
        setSeriesEntries(
          stories.sort((a, b) => {
            if (a.place && b.place) {
              return a.place - b.place;
            }
            return 0;
          })
        );
      }
      if (props.series.series_title !== preselectedTitle) {
        setPreselectedTitle(props.series.series_title);
      }
      if (props.series.series_description !== preselectedDescription) {
        setPreselectedDescription(props.series.series_description);
      }
      if (props.series.image_url !== imageURL) {
        setImageURL(props.series.image_url);
      }
      setSeriesEditForm((prevFormInput) => ({
        ...prevFormInput,
        series_id: props.series?.series_id,
      }));
    }
  }, [props.series]);

  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.error("file reading has failed");
      reader.onload = () => {
        setSeriesEditForm((prevFormInput) => ({
          ...prevFormInput, // spread previous form input
          file: file, // set new image data
        }));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (seriesEntries) {
      const newVolumes = Array.from(seriesEntries);
      const [reorderedItem] = newVolumes.splice(result.source.index, 1);
      newVolumes.splice(result.destination.index, 0, reorderedItem);
      const updatedVolumes = newVolumes.map((vol, idx) => {
        return { ...vol, place: idx + 1 };
      });
      setSeriesEntries(updatedVolumes);
      setSeriesEditForm((prevFormInput) => ({
        ...prevFormInput,
        stories: updatedVolumes,
      }));
    }
  };

  const handleSubmit = async () => {
    seriesFormMessage.title = "Cannot edit series";
    seriesFormMessage.message = "";
    seriesFormMessage.severity = AlertToastType.error;
    if (!seriesEditForm || !props.series) {
      return;
    }
    if (seriesEditForm.title && !seriesEditForm.title.trim().length) {
      seriesFormMessage.message = "Title cannot be blank";
      dispatch(setAlert(seriesFormMessage));
      return;
    }
    if (seriesEditForm.description && !seriesEditForm.description?.trim().length) {
      seriesFormMessage.message = "Description cannot be blank";
      dispatch(setAlert(seriesFormMessage));
      return;
    }

    const formData = new FormData();
    for (const key in seriesEditForm) {
      if (seriesEditForm.hasOwnProperty(key)) {
        const value = seriesEditForm[key];
        if (value === undefined) continue;
        if (typeof value === "string" || typeof value === "number") {
          formData.append(key, value.toString());
          continue;
        }
        if (value instanceof Array) {
          formData.append(key, JSON.stringify(value));
        }
        if (value instanceof File) {
          formData.append("file", value);
        }
      }
    }
    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/series/" + seriesEditForm.series_id, {
        credentials: "include",
        method: "PUT",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        throw error;
      }
      const { ["series_id"]: _, ...rest } = seriesEditForm;
      setSeriesEditForm(rest);

      const json = await response.json();
      const foundSeriesIndex = seriesList.findIndex((srs) => srs.series_id === json.series_id);
      if (foundSeriesIndex !== -1) {
        const newImgURL = json.image_url.length
          ? json.image_url + "?cache=" + new Date().getMilliseconds()
          : seriesList[foundSeriesIndex].image_url;
        const updatedSeries = {
          ...seriesList[foundSeriesIndex],
          series_description: json.series_description,
          series_title: json.series_title,
          image_url: newImgURL,
          stories: seriesList[foundSeriesIndex].stories.map((volume) => {
            const matchingDbVolume = json.stories.find((dbVolume: any) => dbVolume.story_id === volume.story_id);
            return matchingDbVolume ? { ...volume, place: matchingDbVolume.place } : volume;
          }),
        };
        const newList = [...seriesList];
        newList[foundSeriesIndex] = updatedSeries;
        dispatch(setSeriesList(newList));
      }
      dispatch(setIsLoaderVisible(false));
      handleClose();
    } catch (error: any) {
      console.error("Error fetching data: ", error);
      seriesFormMessage.message = "Unable to edit your series at this time. Please try again later or contact support.";
      dispatch(setAlert(seriesFormMessage));
      dispatch(setIsLoaderVisible(false));
    }
    seriesFormMessage.title = "Edit Action Complete";
    seriesFormMessage.message = "Your changes were saved.";
    seriesFormMessage.severity = AlertToastType.success;
    dispatch(setAlert(seriesFormMessage));
  };

  const removeStory = async (event: React.MouseEvent, id: string, selectedTitle: string) => {
    event.stopPropagation();
    const confirmText = "Remove " + selectedTitle + " from " + props.series?.series_title + "?";
    const conf = window.confirm(confirmText);
    if (conf) {
      dispatch(setIsLoaderVisible(true));
      const url = "/api/series/" + seriesEditForm?.series_id + "/story/" + id;
      try {
        const response = await fetch(url, {
          credentials: "include",
          method: "PUT",
        });
        if (!response.ok) {
          const errorData = await response.json();
          const error = new Error(JSON.stringify(errorData));
          error.message = response.statusText;
          throw error;
        }

        const json = await response.json();
        const foundSeriesIndex = seriesList.findIndex((srs) => srs.series_id === json.series_id);
        if (foundSeriesIndex !== -1) {
          const editedStory = seriesList[foundSeriesIndex].stories.find((volume) => volume.story_id === id);
          if (editedStory) {
            const newStandaloneList = [...standaloneList];
            newStandaloneList.push(editedStory);
            dispatch(setStandaloneList(newStandaloneList));
            const newSeriesStories = seriesList[foundSeriesIndex].stories.filter((volume) => volume.story_id !== id);
            const updatedSeries = {
              ...seriesList[foundSeriesIndex],
              stories: newSeriesStories,
            };
            const newList = [...seriesList];
            newList[foundSeriesIndex] = updatedSeries;
            dispatch(setSeriesList(newList));

            const newEditForm = { ...seriesEditForm };
            newEditForm.stories = newSeriesStories;
            dispatch(setSeriesBeingEdited(newEditForm));
          }
        }
        dispatch(setIsLoaderVisible(false));
      } catch (error: any) {
        console.error("Error fetching data: ", error.message);
        seriesFormMessage.message =
          "Unable to edit your series at this time. Please try again later or contact support.";
        dispatch(setAlert(seriesFormMessage));
        dispatch(setIsLoaderVisible(false));
      }
    }
  };

  const editStory = (event: React.MouseEvent, storyID: string) => {
    event.stopPropagation();
    if (seriesEntries) {
      const selected = seriesEntries.find((entry) => entry.story_id === storyID);
      if (selected) {
        const newProps: Story = {
          story_id: storyID,
          title: selected.title,
          description: selected.description,
          series_id: selected.series_id,
          image_url: selected.image_url,
          chapters: selected.chapters,
        };
        dispatch(setStoryBeingEdited(newProps));
        dispatch(flipEditingStory(selected.series_id));
      }
    }
  };

  const addStory = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch(flipCreatingNewStory(props.series?.series_id));
    handleClose();
  };

  const onImageLoaded = () => {
    setImageName(preselectedTitle);
  };

  return (
    <div>
      <Dialog className={styles.editSeriesModal} open={isEditingSeries} onClose={handleClose}>
        <DialogTitle>Edit Series</DialogTitle>
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
                <label htmlFor="edit-series-title">Title:</label>
                <input
                  defaultValue={preselectedTitle}
                  key={preselectedTitle}
                  type="text"
                  id="edit-series-title"
                  onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    setSeriesEditForm((prevFormInput) => ({
                      ...prevFormInput,
                      title: (event.target as HTMLInputElement).value,
                    }));
                  }}
                />
              </p>
              <p>
                <label htmlFor="edit-series-description">Description</label>
                <textarea
                  defaultValue={preselectedDescription}
                  key={preselectedDescription}
                  spellCheck="false"
                  id="edit-story-description"
                  onChange={(event) => {
                    setSeriesEditForm((prevFormInput) => ({
                      ...prevFormInput,
                      description: event.target.value,
                    }));
                  }}
                />
              </p>
            </div>
          </div>
          <div>
            <h3>
              Volumes
              <IconButton
                className="addStory"
                aria-label="add story"
                sx={{ padding: "0" }}
                component="label"
                title="Add"
                onClick={(event) => {
                  addStory(event);
                }}>
                <AddIcon
                  sx={{
                    fontSize: "24px",
                    color: "#000",
                    padding: "0px",
                    marginLeft: "4px",
                    marginTop: "-4px",
                    "&:hover": {
                      fontWeight: "bold",
                    },
                  }}
                />
              </IconButton>
            </h3>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="droppable">
                {(provided) => (
                  <span {...provided.droppableProps} ref={provided.innerRef}>
                    {seriesEntries &&
                      seriesEntries.map((entry, index) => (
                        <Draggable key={entry.story_id} draggableId={entry.story_id} index={index}>
                          {(provided) => (
                            <div
                              className={styles.editSeriesVolumes}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}>
                              {
                                <div>
                                  <span className={styles.seriesIcon}>
                                    <img src={entry.image_url} alt={entry.title} />
                                  </span>
                                  <span>{entry.title}</span>
                                  <span className={styles.storyButtons}>
                                    <IconButton
                                      className={styles.editSeriesStory}
                                      aria-label="edit story"
                                      sx={{ padding: "0" }}
                                      component="label"
                                      title="Edit"
                                      onClick={(event) => {
                                        editStory(event, entry.story_id);
                                      }}>
                                      <EditIcon
                                        sx={{
                                          fontSize: "18px",
                                          color: "#000",
                                          padding: "8px",
                                          "&:hover": {
                                            fontWeight: "bold",
                                          },
                                        }}
                                      />
                                    </IconButton>
                                    <IconButton
                                      className={styles.removeSeriesStory}
                                      aria-label="remove story"
                                      component="label"
                                      title="Remove"
                                      onClick={(event) => {
                                        removeStory(event, entry.story_id, entry.title);
                                      }}>
                                      <RemoveIcon
                                        sx={{
                                          fontSize: "18px",
                                          color: "#000",
                                          "&:hover": {
                                            fontWeight: "bold",
                                          },
                                        }}
                                      />
                                    </IconButton>
                                  </span>
                                </div>
                              }
                            </div>
                          )}
                        </Draggable>
                      ))}
                    {provided.placeholder}
                  </span>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Update</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default EditSeriesModal;
