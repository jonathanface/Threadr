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
import {
  setAlertLink,
  setAlertMessage,
  setAlertOpen,
  setAlertSeverity,
  setAlertTimeout,
  setAlertTitle,
} from "../../stores/alertSlice";
import { setSeriesList } from "../../stores/seriesSlice";
import { flipCreatingNewStory, setStandaloneList } from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import PortraitDropper from "../portraitdropper/PortraitDropper";

const CreateNewStory = () => {
  const [isInASeries, setIsInASeries] = useState(false);
  const [series, setSeries] = useState([]);
  const isCreatingNewStory = useSelector((state) => state.stories.isCreatingNew);
  const userDetails = useSelector((state) => state.user.userDetails);
  const isLoggedIn = useSelector((state) => state.user.isLoggedIn);
  const belongsToSeries = useSelector((state) => state.stories.belongsToSeries);
  const standaloneList = useSelector((state) => state.stories.standaloneList);
  const seriesList = useSelector((state) => state.series.seriesList);

  const dispatch = useDispatch();
  const initMap = new Map();
  initMap["place"] = 1;
  const [formInput, setFormInput] = useState(initMap);
  if (belongsToSeries) {
    formInput["series_id"] = belongsToSeries;
  }

  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState("");
  const [imageURL, setImageURL] = useState();
  const [imageName, setImageName] = useState("Loading...");
  const [seriesMember, setSeriesMember] = useState({ label: "" });
  const defaultImageURL = "img/icons/story_standalone_icon.jpg";

  const resetForm = () => {
    setFormInput(initMap);
    setAreErrors(false);
    setCurrentError("");
    setIsInASeries(false);

    setSeriesMember({ label: "" });
  };

  const handleClose = () => {
    resetForm();
    dispatch(flipCreatingNewStory(null));
  };

  const toggleSeries = () => {
    setIsInASeries(!isInASeries);
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
        if (data && data[userDetails.email]) {
          const reduced = data[userDetails.email].reduce((accumulator, currentValue) => {
            if (!accumulator[currentValue.series_id]) {
              accumulator[currentValue.series_id] = {
                id: currentValue.series_id,
                title: currentValue.series_title,
                count: 0,
                selected: false,
              };
              const found = currentValue.stories.some((story) => story.series_id === belongsToSeries);
              if (found) {
                accumulator[currentValue.series_id].selected = true;
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
              setSeriesMember(entry);
              setIsInASeries(true);
            }
            params.push(entry);
          }
          setSeries(params);
        }
      })
      .catch((error) => {
        console.error("get series", error);
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
        updateFormImage();
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const getBlobExtension = (mimeType) => {
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

  const updateFormImage = async () => {
    fetch(imageURL, {
      headers: {
        Accept: "image/*",
      },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const fd = new FormData();
        fd.append("file", blob, "temp" + getBlobExtension(blob.type));
        setFormInput((prevFormInput) => ({
          ...prevFormInput, // spread previous form input
          image: fd, // set new image data
        }));
      })
      .catch((error) => {
        console.error("Fetch operation failed: ", error);
      });
  };

  useEffect(() => {
    if (imageURL) {
      updateFormImage();
    }
  }, [imageURL]);

  useEffect(() => {
    if (isLoggedIn && isCreatingNewStory) {
      getSeries();
      getDefaultImage();
      setIsInASeries(false);
    }
  }, [isLoggedIn, isCreatingNewStory]);

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

    if (formInput["series_id"]) {
      formInput["place"] = series.length;
    }
    setCurrentError("");
    setAreErrors(false);

    const formData = formInput.image ? formInput.image : new FormData();
    for (const key in formInput) {
      if (key !== "image" && formInput.hasOwnProperty(key) && formInput[key] !== null) {
        formData.delete(key);
        formData.append(key, formInput[key]);
      }
    }
    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/stories", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        if (response.status === 401) {
          dispatch(setAlertTitle("Insufficient Subscription"));
          dispatch(setAlertMessage("Non-subscribers are limited to a single story."));
          dispatch(setAlertLink({ location: "subscribe" }));
          dispatch(setAlertSeverity("error"));
          dispatch(setAlertTimeout(null));
          dispatch(setAlertOpen(true));
          handleClose();
          dispatch(setIsLoaderVisible(false));
          return;
        }
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.response = response;
        throw error;
      }

      const json = await response.json();
      if (json.series_id.length) {
        // added to a series
        const seriesIndex = seriesList.findIndex((srs) => srs.series_id === json.series_id);

        if (seriesIndex >= 0) {
          // series is already known
          const updatedSeries = JSON.parse(JSON.stringify(seriesList[seriesIndex]));

          updatedSeries.stories.push({
            story_id: json.story_id,
            series_id: json.series_id,
            title: json.title,
            place: json.place,
            created_at: json.created_at,
            description: json.description,
            image_url: json.image_url.length ? json.image_url : "/img/icons/story_standalone_icon.jpg",
          });
          const newSeriesList = [...seriesList];
          newSeriesList[seriesIndex] = updatedSeries;
          dispatch(setSeriesList(newSeriesList));
        } else {
          // unknown series - probably new
          console.log("Series not found");
        }
      } else {
        // added as a standalone
        const newStory = {
          story_id: json.story_id,
          description: json.description,
          title: json.title,
          image_url: json.image_url + "?cache=" + new Date().getMilliseconds(),
        };
        const newStandaloneList = [...standaloneList];
        newStandaloneList.push(newStory);
        dispatch(setStandaloneList(newStandaloneList));
      }
      //const storyID = json.story_id;
      //dispatch(setSelectedStory({ id: storyID, title: json.title }));
      //const history = window.history;
      //history.pushState({ storyID }, "created new story", "/story/" + storyID + "?chapter=1");
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error) {
      console.error("creation error", error);
      const errorData = error.response ? JSON.parse(error.message) : {};
      if (errorData.error) {
        setCurrentError(errorData.error);
      } else {
        setCurrentError("Unable to create your story at this time. Please try again later.");
      }
      setAreErrors(true);
    }
    dispatch(setIsLoaderVisible(false));
  };

  const processImage = (acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.error("file reading has failed");
      reader.onload = () => {
        const newFormData = new FormData();
        newFormData.append("file", file, "temp" + getBlobExtension(file.type));
        setFormInput((prevFormInput) => ({
          ...prevFormInput, // spread previous form input
          image: newFormData, // set new image data
        }));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const onImageLoaded = () => {
    setImageName("New Image");
  };

  return (
    <div>
      <Dialog open={isCreatingNewStory} onClose={handleClose}>
        <DialogTitle>Create a Story</DialogTitle>
        <DialogContent>
          <Box component="form">
            <div>
              <h3>Image for Your Story</h3>
              <PortraitDropper
                imageURL={imageURL}
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
                    if (event) {
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: actions.id,
                        series_title: actions.label,
                      }));
                    }
                  }}
                  freeSolo
                  options={series}
                  value={seriesMember}
                  renderInput={(params) => <TextField {...params} label="Series" />}
                />
              </div>
            ) : (
              ""
            )}
            {areErrors && (
              <div id="error_report" className="form-error">
                {currentError}
              </div>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Create</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
export default CreateNewStory;
