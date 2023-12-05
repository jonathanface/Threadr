import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setSeriesEditables, setSeriesList } from "../../stores/seriesSlice";
import { flipEditingStory, setStandaloneList, setStoryEditables } from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import PortraitDropper from "../portraitdropper/PortraitDropper";

const EditStory = () => {
  const isEditingStory = useSelector((state) => state.stories.isEditingStory);
  const isLoggedIn = useSelector((state) => state.user.isLoggedIn);
  const userDetails = useSelector((state) => state.user.userDetails);
  const dispatch = useDispatch();

  const editables = useSelector((state) => state.stories.editables);
  const seriesEditables = useSelector((state) => state.series.editables);
  const standaloneList = useSelector((state) => state.stories.standaloneList);
  const seriesList = useSelector((state) => state.series.seriesList);

  const [imageName, setImageName] = useState("Loading...");
  const [belongsToSeries, setBelongsToSeries] = useState("");
  const [series, setSeries] = useState([]);
  const [isInASeries, setIsInASeries] = useState(false);
  const [formInput, setFormInput] = useState({});
  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState("");

  const resetForm = () => {
    setFormInput({});
    setAreErrors(false);
    setCurrentError("");
    setIsInASeries(false);
    setBelongsToSeries("");
  };

  const getSeries = () => {
    fetch("/api/series")
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("Fetch problem series " + response.status);
      })
      .then((data) => {
        const seriesStoriesFromDB = data[userDetails.email].map((series) => {
          const seriesObj = {
            series_id: series.series_id,
            series_title: series.series_title,
            series_description: series.series_description,
            stories: [],
            image_url: series.image_url.length ? series.image_url : "/img/icons/story_series_icon.jpg",
          };
          if (series.stories) {
            series.stories.forEach((story) => {
              seriesObj.stories.push({
                story_id: story.story_id,
                series_id: series.series_id,
                title: story.title,
                place: story.place,
                created_at: story.created_at,
                description: story.description,
                image_url: story.image_url.length ? story.image_url : "/img/icons/story_standalone_icon.jpg",
              });
            });
          }
          return seriesObj;
        });
        dispatch(setSeriesList(seriesStoriesFromDB));

        const reduced = data[userDetails.email].reduce((accumulator, currentValue) => {
          if (!accumulator[currentValue.series_id]) {
            accumulator[currentValue.series_id] = {
              id: currentValue.series_id,
              title: currentValue.series_title,
              count: 0,
              selected: false,
            };
            if (currentValue.stories) {
              const found = currentValue.stories.some((story) => story.story_id === editables.story_id);
              if (found) {
                accumulator[currentValue.series_id].selected = true;
              }
            }
          }
          accumulator[currentValue.series_id].count += 1;
          return accumulator;
        }, {});

        const params = [];
        for (const series_id in reduced) {
          const series = reduced[series_id];
          const entry = {
            label: series.title,
            id: series.id,
            count: series.count,
          };
          if (series.selected) {
            setBelongsToSeries(entry);
          }
          params.push(entry);
        }
        setSeries(params);
      })
      .catch((error) => {
        console.error("get series", error);
      });
  };

  const handleClose = () => {
    console.log("set close");
    resetForm();
    dispatch(flipEditingStory());
  };

  const toggleSeries = () => {
    setIsInASeries(!isInASeries);
    if (!isInASeries) {
      setFormInput((prevFormInput) => ({
        ...prevFormInput,
        series_id: null,
        series_title: null,
      }));
    }
  };

  useEffect(() => {
    if (isLoggedIn && isEditingStory) {
      getSeries();
      setIsInASeries(!!editables.series_id);
    }
    setFormInput((prevFormInput) => ({
      ...prevFormInput,
      title: editables.title,
      description: editables.description,
      ...(editables.series_id && { series_id: editables.series_id }),
    }));
  }, [editables, isLoggedIn, isEditingStory]);

  const handleSubmit = async () => {
    if (!formInput["title"] || !formInput["title"].trim().length) {
      setCurrentError("Title cannot be blank");
      setAreErrors(true);
      return;
    }
    if (!formInput["description"] || !formInput["description"].trim().length) {
      setCurrentError("Description cannot be blank");
      setAreErrors(true);
      return;
    }

    if (!isInASeries && formInput.series_id) {
      delete formInput.series_id;
    }

    const formData = new FormData();
    for (const key in formInput) {
      if (formInput.hasOwnProperty(key) && formInput[key] != null && formInput[key] != undefined) {
        if (Array.isArray(formInput[key]) && formInput[key].every((item) => typeof item === "object")) {
          // Stringify the entire array and append under the current key
          formData.append(key, JSON.stringify(formInput[key]));
        } else {
          formData.append(key, formInput[key]);
        }
      }
    }

    setCurrentError("");
    setAreErrors(false);
    dispatch(setIsLoaderVisible(true));

    try {
      const response = await fetch("/api/stories/" + editables.story_id + "/details", {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.response = response; // Attach the response to the error object
        throw error;
      }
      const json = await response.json();

      if (json.series_id.length) {
        // added to a series
        const newStandaloneList = standaloneList.filter(
          (item) => item.series_id !== json.series_id && item.story_id !== json.story_id
        );
        getSeries();
        dispatch(setStandaloneList(newStandaloneList));
      } else {
        // removed from a series or never was in one
        const foundStoryIndex = standaloneList.findIndex((stry) => stry.story_id === json.story_id);
        if (foundStoryIndex !== -1) {
          const updatedStory = {
            ...standaloneList[foundStoryIndex],
            description: json.description,
            title: json.title,
            image_url: json.image_url + "?cache=" + new Date().getMilliseconds(),
          };
          delete updatedStory.series_id;
          const newList = [...standaloneList];
          newList[foundStoryIndex] = updatedStory;
          dispatch(setStandaloneList(newList));
        } else if (editables.series_id) {
          // removed from series
          const formerSeriesIndex = seriesList.findIndex((srs) => srs.series_id === editables.series_id);
          const updatedStoryList = seriesList[formerSeriesIndex].stories.filter(
            (item) => item.story_id !== json.story_id
          );
          const newList = seriesList.map((item, index) => {
            if (index === formerSeriesIndex) {
              return {
                ...item, // spread to copy properties
                stories: updatedStoryList, // new stories array
              };
            }
            return item;
          });
          const newSeriesEditables = {
            ...seriesEditables,
            stories: updatedStoryList,
          };
          dispatch(setSeriesEditables(newSeriesEditables));
          dispatch(setSeriesList(newList));

          const updatedStory = {
            story_id: json.story_id,
            description: json.description,
            title: json.title,
            image_url: json.image_url + "?cache=" + new Date().getMilliseconds(),
          };
          const newStandaloneList = [...standaloneList];
          newStandaloneList.push(updatedStory);
          dispatch(setStandaloneList(newStandaloneList));
        }
        const { ["series_id"]: _, ...rest } = editables;
        setStoryEditables(rest);
        getSeries();
      }
      dispatch(setIsLoaderVisible(false));
      handleClose();
    } catch (error) {
      console.error("Error fetching data: ", error.message);
      const errorData = error.response ? JSON.parse(error.message) : {};
      if (errorData.error) {
        setCurrentError(errorData.error);
      } else {
        setCurrentError("Unable to edit your story at this time. Please try again later.");
      }
      dispatch(setIsLoaderVisible(false));
      setAreErrors(true);
    }
  };

  const storyTitle = editables.title ? editables.title : "Unknown Story";

  const processImage = (acceptedFiles) => {
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

  const onImageLoaded = () => {
    setImageName(storyTitle);
  };

  return (
    <div>
      <Dialog open={isEditingStory} onClose={handleClose}>
        <DialogTitle>Edit</DialogTitle>
        <DialogContent>
          <Box className="form-box" component="form">
            <h3>Image for {storyTitle}</h3>
            <PortraitDropper
              imageURL={editables.image_url}
              name={imageName}
              onImageLoaded={onImageLoaded}
              onComplete={processImage}
            />
            <div>
              <TextField
                onChange={(event) => {
                  setFormInput((prevFormInput) => ({
                    ...prevFormInput,
                    title: event.target.value,
                  }));
                }}
                autoFocus
                label="Title"
                defaultValue={editables.title}
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
                defaultValue={editables.description}
                multiline
                maxRows={4}
              />
            </div>
            <div>
              <FormControlLabel
                label="This is part of a series"
                control={<Checkbox checked={isInASeries} id="isSeries" label="" onChange={toggleSeries} />}
                sx={{
                  "& .MuiFormControlLabel-label": { color: "rgba(0, 0, 0, 0.6)" },
                }}
              />
            </div>
            {isInASeries ? (
              <div>
                <Autocomplete
                  onInputChange={(event) => {
                    if (event) {
                      const entered = event.target.value.toString();
                      const foundSeries = series.find((srs) => srs.label.toLowerCase() === entered.toLowerCase());
                      const settingSeriesID = foundSeries && foundSeries.id ? foundSeries.id : null;
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: settingSeriesID,
                        series_title: entered,
                      }));
                    }
                  }}
                  onChange={(event, actions) => {
                    if (event && actions) {
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: actions.id,
                      }));
                    }
                  }}
                  freeSolo
                  options={series}
                  value={belongsToSeries}
                  renderInput={(params) => <TextField {...params} label="Series" />}
                />
              </div>
            ) : (
              ""
            )}
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

export default EditStory;
