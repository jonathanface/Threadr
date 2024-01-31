import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import RemoveIcon from "@mui/icons-material/Remove";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import React, { useEffect, useState } from "react";
import { DragDropContext, Draggable, DropResult, Droppable } from "react-beautiful-dnd";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import "../../css/edit-series.css";
import { flipEditingSeries, setSeriesEditables, setSeriesList } from "../../stores/seriesSlice";
import { AppDispatch, RootState } from "../../stores/store";
import {
  flipCreatingNewStory,
  flipEditingStory,
  setStandaloneList,
  setStoryBeingEdited,
} from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { Story } from "../../types";
import PortraitDropper from "../portraitdropper/PortraitDropper";

const EditSeriesModal = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();
  const isEditingSeries = useAppSelector((state) => state.series.isEditingSeries);
  const editables = useAppSelector((state) => state.series.editables);
  const seriesList = useAppSelector((state) => state.series.seriesList);
  const standaloneList = useAppSelector((state) => state.stories.standaloneList);
  const [volumes, setVolumes] = useState<Story[] | null>(null);
  const [formInput, setFormInput] = useState<Map<string, any>>(new Map());
  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState("");
  const [imageName, setImageName] = useState("Loading...");

  const resetForm = () => {
    setAreErrors(false);
    setCurrentError("");
  };

  const handleClose = () => {
    resetForm();
    dispatch(flipEditingSeries());
  };

  useEffect(() => {
    if (editables.stories) {
      const volumes = editables.stories.slice();
      setVolumes(
        volumes.sort((a, b) => {
          if (a.place && b.place) {
            return a.place - b.place;
          }
          return 0;
        })
      );
    }
    setFormInput((prevFormInput) => ({
      ...prevFormInput,
      title: editables.series_title,
      description: editables.series_description ? editables.series_description : "",
      ...(editables.series_id && { series_id: editables.series_id }),
    }));
  }, [editables]);

  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.error("file reading has failed");
      reader.onload = () => {
        setFormInput((prevFormInput) => ({
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
    if (volumes) {
      const newVolumes = Array.from(volumes);
      const [reorderedItem] = newVolumes.splice(result.source.index, 1);
      newVolumes.splice(result.destination.index, 0, reorderedItem);
      const updatedVolumes = newVolumes.map((vol, idx) => {
        return { ...vol, place: idx + 1 };
      });
      setVolumes(updatedVolumes);
      setFormInput((prevFormInput) => ({
        ...prevFormInput,
        stories: updatedVolumes,
      }));
    }
  };

  const handleSubmit = async () => {
    if (!formInput.has("title") || !formInput.get("title").trim().length) {
      setCurrentError("Title cannot be blank");
      setAreErrors(true);
      return;
    }

    const formData = new FormData();
    for (const key in formInput) {
      if (formInput.hasOwnProperty(key) && formInput.get(key) != null && formInput.get(key) != undefined) {
        if (Array.isArray(formInput.get(key)) && formInput.get(key).every((item: any) => typeof item === "object")) {
          // Stringify the entire array and append under the current key
          formData.append(key, JSON.stringify(formInput.get(key)));
        } else {
          formData.append(key, formInput.get(key));
        }
      }
    }
    setCurrentError("");
    setAreErrors(false);
    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/series/" + editables.series_id, {
        credentials: "include",
        method: "PUT",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.message = response.statusText; // Attach the response to the error object
        throw error;
      }
      const { ["series_id"]: _, ...rest } = editables;
      setSeriesEditables(rest);

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
      const errorData = error.response ? JSON.parse(error.message) : {};
      if (errorData.error) {
        setCurrentError(errorData.error);
      } else {
        setCurrentError("Unable to edit your series at this time. Please try again later.");
      }
      setAreErrors(true);
      dispatch(setIsLoaderVisible(false));
    }
  };

  const removeStory = async (event: React.MouseEvent, id: string, selectedTitle: string) => {
    event.stopPropagation();
    const confirmText = "Remove " + selectedTitle + " from " + editables.series_title + "?";
    const conf = window.confirm(confirmText);
    if (conf) {
      setCurrentError("");
      setAreErrors(false);
      dispatch(setIsLoaderVisible(true));
      const url = "/api/series/" + editables.series_id + "/story/" + id;
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

            const newEditables = { ...editables };
            newEditables.stories = newSeriesStories;
            dispatch(setSeriesEditables(newEditables));
          }
        }
        dispatch(setIsLoaderVisible(false));
      } catch (error: any) {
        console.error("Error fetching data: ", error.message);
        const errorData = error.response ? JSON.parse(error.message) : {};
        if (errorData.error) {
          setCurrentError(errorData.error);
        } else {
          setCurrentError("Unable to edit your series at this time. Please try again later.");
        }
        setAreErrors(true);
        dispatch(setIsLoaderVisible(false));
      }
    }
  };

  const editStory = (event: React.MouseEvent, storyID: string) => {
    event.stopPropagation();
    if (volumes) {
      const selected = volumes.find((volume) => volume.story_id === storyID);
      if (selected) {
        const newProps: Story = {
          story_id: storyID,
          title: selected.title,
          description: editables.series_description,
          series_id: editables.series_id,
          image_url: selected.image_url,
          chapters: selected.chapters,
        };
        dispatch(setStoryBeingEdited(newProps));
        dispatch(flipEditingStory(editables.series_id));
      }
    }
  };

  const addStory = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch(flipCreatingNewStory(editables.series_id));
    handleClose();
  };

  const onImageLoaded = () => {
    setImageName(editables.series_title);
  };

  return (
    <div>
      <Dialog className="edit-series-modal" open={isEditingSeries} onClose={handleClose}>
        <DialogTitle>Edit Series</DialogTitle>
        <DialogContent>
          <Box component="form">
            <div>
              <h3>Image for Your Series</h3>
              <PortraitDropper
                imageURL={editables.image_url}
                name={imageName}
                onImageLoaded={onImageLoaded}
                onComplete={processImage}
              />
              <TextField
                onChange={(event) => {
                  setFormInput((prevFormInput) => ({
                    ...prevFormInput,
                    title: event.target.value,
                  }));
                }}
                autoFocus
                label="Title"
                defaultValue={editables.series_title}
                helperText="Cannot be blank"
              />
            </div>
            <div>
              <TextField
                onChange={(event) => {
                  setFormInput((prevFormInput) => ({
                    ...prevFormInput,
                    description: event.target.value,
                  }));
                }}
                label="Description"
                helperText="Cannot be blank"
                defaultValue={editables.series_description}
                multiline
                maxRows={4}
              />
            </div>
            <div>
              <h3>
                Volumes
                <IconButton
                  className="add-story"
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
                      padding: "8px",
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
                      {volumes &&
                        volumes.map((entry, index) => (
                          <Draggable key={entry.story_id} draggableId={entry.story_id} index={index}>
                            {(provided) => (
                              <div
                                className="edit-series-volumes"
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}>
                                {
                                  <div>
                                    <img src={entry.image_url} alt={entry.title} />
                                    <span>{entry.title}</span>
                                    <span className="story-buttons">
                                      <IconButton
                                        className="edit-series-story"
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
                                        className="remove-series-story"
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
            {areErrors ? (
              <div id="error_report" className="form-error">
                {currentError}
              </div>
            ) : (
              ""
            )}
          </Box>
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
