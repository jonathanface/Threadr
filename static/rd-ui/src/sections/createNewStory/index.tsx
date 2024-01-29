import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../stores/store";
import { flipCreatingNewStory } from "../../stores/storiesSlice";
import PortraitDropper from "../portraitdropper/PortraitDropper";

import styles from "./createNewStory.module.css";

interface SeriesSelectionOptions {
  label: string;
  id: string;
  count: number;
}

const CreateNewStory = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const seriesList = useAppSelector((state) => state.series.seriesList);
  const isCreatingNewStory = useAppSelector((state) => state.stories.isCreatingNew);

  const [imageURL, setImageURL] = useState("");
  const [imageName, setImageName] = useState("Loading...");
  const defaultImageURL = "img/icons/story_standalone_icon.jpg";

  const [submitButtonDisabled, setSubmitButtonDisabled] = useState(true);

  const getDefaultImage = () => {
    const randomImageURL = "https://picsum.photos/300";
    fetch(randomImageURL)
      .then((response) => {
        if (response.ok) {
          setImageURL(response.url);
        } else {
          setImageURL(defaultImageURL);
        }
        //updateFormImage();
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const handleClose = () => {
    //resetForm();
    dispatch(flipCreatingNewStory(null));
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
    if (isCreatingNewStory) {
      getDefaultImage();
    }
  }, [isCreatingNewStory]);

  const processImage = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.error("file reading has failed");
      reader.onload = () => {
        //const newFormData = new FormData();
        //newFormData.append("file", file, "temp" + getBlobExtension(file.type));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSubmit = () => {};

  return (
    <Dialog open={isCreatingNewStory} onClose={handleClose} className={styles.storyForm}>
      <DialogTitle>Create a Story</DialogTitle>
      <DialogContent>
        <div className={styles.column}>
          <PortraitDropper
            imageURL={imageURL}
            name={imageName}
            onImageLoaded={onImageLoaded}
            onComplete={processImage}
          />
        </div>
        <div className={styles.column}></div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button disabled={submitButtonDisabled} onClick={handleSubmit}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
  /*
  const isCreatingNewStory = useAppSelector((state) => state.stories.isCreatingNew);
  const userDetails = useAppSelector((state) => state.user.userDetails);
  const isLoggedIn = useAppSelector((state) => state.user.isLoggedIn);
  const belongsToSeries = useAppSelector((state) => state.stories.belongsToSeries);
  const standaloneList = useAppSelector((state) => state.stories.standaloneList);
  const seriesList = useAppSelector((state) => state.series.seriesList);
  
  const [isInASeries, setIsInASeries] = useState(false);
  const [series, setSeries] = useState<SeriesSelectionOptions[]>();
  const [submitButtonDisabled, setSubmitButtonDisabled] = useState(true);

  const initMap: Map<string, string> = new Map();
  initMap.set("place", "1");

  const [formInput, setFormInput] = useState(initMap);
  if (belongsToSeries) {
    formInput.set("series_id", belongsToSeries);
  }

  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [imageName, setImageName] = useState("Loading...");
  const [seriesMember, setSeriesMember] = useState({ label: "" });
  const defaultImageURL = "img/icons/story_standalone_icon.jpg";

  const parentDiv = useRef<HTMLElement>(null);

  const resetForm = () => {
    setSubmitButtonDisabled(true);
    setFormInput(initMap);
    setAreErrors(false);
    setCurrentError("");
    setIsInASeries(false);
    setImageURL("");
    setImageName("Loading...");
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
    fetch("/api/series", {
      credentials: "include",
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("Fetch problem series " + response.status);
      })
      .then((data: Map<string, Series[]>) => {
        if (data && data.has(userDetails.email)) {
          const reduced = data.get(userDetails.email)?.reduce((accumulator: Series, currentValue: Series) => {
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
          });
          const params: SeriesSelectionOptions[] = [];
          for (const series_id in reduced) {
            const series = reduced[series_id];
            const entry: SeriesSelectionOptions = {
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

  const updateFormImage = async () => {
    fetch(imageURL, {
      credentials: "include",
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
    const handleScrollEnd = () => {
      setSubmitButtonDisabled(false);
    };

    const div = parentDiv.current;
    if (div) {
      div.addEventListener("scrollend", handleScrollEnd);
    }
    return () => {
      if (div) {
        div.removeEventListener("scrollend", handleScrollEnd);
      }
    };
  }, [parentDiv]);

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
    if (!formInput.has("title") || !formInput.get("title")?.trim().length) {
      setCurrentError("Title cannot be blank");
      setAreErrors(true);
      return;
    }
    if (!formInput.has("description") || !formInput.get("description")?.trim().length) {
      setCurrentError("Description cannot be blank");
      setAreErrors(true);
      return;
    }

    if (formInput.has("series_id") && series) {
      formInput.set("place", series.length.toString());
    }
    setCurrentError("");
    setAreErrors(false);

    const formData = new FormData();
    for (const [key, value] of formInput) {
      if (key === "image") {
        // Assuming the value is a string representing the file path or similar
        // You may need to adjust this part depending on how the image is represented
        formData.append(key, value);
      } else {
        formData.delete(key);
        formData.append(key, value);
      }
    }

    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/stories", {
        credentials: "include",
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error: Error = new Error(JSON.stringify(errorData));
        error.message = response.toString();
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
            chapters: json.chapters,
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
        const newStory: Story = {
          story_id: json.story_id,
          description: json.description,
          title: json.title,
          chapters: json.chapters,
          image_url: json.image_url + "?cache=" + new Date().getMilliseconds(),
          created_at: json.created_at,
          place: 1,
        };
        const newStandaloneList = [...standaloneList];
        newStandaloneList.push(newStory);
        dispatch(setStandaloneList(newStandaloneList));
      }
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error: any) {
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

  const processImage = (acceptedFiles: File[]) => {
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
        <DialogContent ref={parentDiv}>
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
                control={<Checkbox checked={isInASeries} id="isSeries" onChange={toggleSeries} />}
                sx={{
                  "& .MuiFormControlLabel-label": { color: "rgba(0, 0, 0, 0.6)" },
                }}
              />
            </div>
            {isInASeries ? (
              <div>
                <Autocomplete
                  onInputChange={(event: React.SyntheticEvent) => {
                    if (event) {
                      const target = event.target;
                      const entered = (target as HTMLInputElement).toString();
                      const foundSeries = series?.find((srs) => srs.label.toLowerCase() === entered.toLowerCase());
                      const settingSeriesID = foundSeries && foundSeries.id ? foundSeries.id : null;
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: settingSeriesID,
                        series_title: entered,
                      }));
                    }
                  }}
                  onChange={(event: React.SyntheticEvent, value: any) => {
                    if (event && value) {
                      if (value.hasOwnProperty("id") && value.hasOwnProperty("label")) {
                        setFormInput((prevFormInput) => ({
                          ...prevFormInput,
                          series_id: value.id,
                          series_title: value.label,
                        }));
                      }
                    }
                  }}
                  freeSolo
                  options={seriesList}
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
          <Button disabled={submitButtonDisabled} onClick={handleSubmit}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );*/
};
export default CreateNewStory;
