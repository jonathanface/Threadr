import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "../../css/story.css";
import { flipEditingSeries, setSeriesEditables, setSeriesList } from "../../stores/seriesSlice";
import { flipEditingStory, setSelectedStory, setStandaloneList, setStoryEditables } from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import DetailsSlider from "./DetailsSlider";

const Story = (props) => {
  const dispatch = useDispatch();
  const [wasDeleted, setWasDeleted] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const [isSeries, setIsSeries] = useState(false);
  const seriesList = useSelector((state) => state.series.seriesList);
  const standaloneList = useSelector((state) => state.stories.standaloneList);

  const handleClick = (event, storyID, title, chapterID) => {
    const history = window.history;
    const newStory = {
      id: storyID,
      title: title,
    };
    console.log("chap", chapterID);
    dispatch(setSelectedStory(newStory));
    history.pushState({ storyID }, "clicked story", "/story/" + storyID + "?chapter=" + chapterID);
    dispatch(setIsLoaderVisible(true));
  };

  const editStory = (event, storyID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.story_id = storyID;
    const selected = props.stories ? props.stories.find((volume) => volume.story_id === storyID) : props;
    const seriesToAppend = props.stories ? selected.series_id : null;
    newProps.title = selected.title;
    newProps.description = selected.description;
    if (props.stories) {
      newProps.series_id = props.stories[0].series_id;
    }
    newProps.image_url = selected.image_url;
    dispatch(setStoryEditables(newProps));
    dispatch(flipEditingStory(seriesToAppend));
  };

  const editSeries = (event, seriesID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.series_id = seriesID;
    newProps.stories = props.stories;
    newProps.series_title = props.title;
    newProps.series_description = props.description;
    newProps.image_url = props.image_url;
    dispatch(setSeriesEditables(newProps));
    dispatch(flipEditingSeries());
  };

  const deleteSeries = async (event, id, title) => {
    event.stopPropagation();
    const confirmText =
      "Delete series " + title + "? Any volumes assigned to it will be converted to standalone stories.";
    const conf = window.confirm(confirmText);

    if (conf) {
      dispatch(setIsLoaderVisible(true));
      try {
        dispatch(setIsLoaderVisible(true));
        const url = "/api/series/" + id;
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          const error = new Error(JSON.stringify(errorData));
          error.response = response;
          throw error;
        }

        setWasDeleted(true);
        const foundSeriesIndex = seriesList.findIndex((srs) => srs.series_id === id);
        if (foundSeriesIndex !== -1) {
          const newStandaloneList = [...standaloneList];
          seriesList[foundSeriesIndex].stories.forEach((story) => {
            const newStory = { ...story };
            delete newStory.series_id;
            newStandaloneList.push(newStory);
          });
          dispatch(setStandaloneList(newStandaloneList));

          const newSeriesList = [...seriesList];
          newSeriesList.splice(foundSeriesIndex, 1);
          dispatch(setSeriesList(newSeriesList));
        }
        dispatch(setIsLoaderVisible(false));
      } catch (error) {
        console.error("Error fetching data: ", error);
        //const errorData = error.response ? JSON.parse(error.message) : {};
        dispatch(setIsLoaderVisible(false));
      }
    }
  };

  const deleteStory = (event, id, title) => {
    event.stopPropagation();
    const confirmText =
      (!props.stories ? "Delete story " + title + "?" : "Delete " + title + " from your series " + props.title + "?") +
      (props.series && props.stories.length === 1
        ? "\n\nThere are no other titles in this series, so deleting it will also remove the series."
        : "");

    const conf = window.confirm(confirmText);
    const seriesID = props.stories ? props.id : "";
    if (conf) {
      dispatch(setIsLoaderVisible(true));
      const url = "/api/stories/" + id + "?series=" + seriesID;
      fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }).then((response) => {
        if (response.ok) {
          setWasDeleted(true);
        }
        dispatch(setIsLoaderVisible(false));
      });
    }
  };

  const editHoverText = "Edit " + props.title;
  const deleteHoverText = "Delete " + props.title;

  useEffect(() => {
    if (props.stories) {
      setIsSeries(true);
    } else {
      setIsSeries(false);
    }
  }, [props.stories]);

  return !wasDeleted ? (
    <button
      className="doc-button"
      onClick={!props.stories ? (e) => handleClick(e, props.id, props.title, props.chapters[0].id) : () => {}}>
      <div className="loading-screen" style={{ visibility: isStoryLoaderVisible ? "visible" : "hidden" }}>
        <Box className="progress-box" />
        <Box className="prog-anim-holder">
          <CircularProgress />
        </Box>
      </div>
      <div className="storyBubble">
        <img
          src={props.image_url}
          alt={props.title}
          onLoad={() => {
            setIsStoryLoaderVisible(false);
          }}
        />
        <div className="story-label">
          <span className="title">{props.title}</span>
          <span className="buttons">
            <IconButton
              aria-label="edit story"
              sx={{ padding: "0" }}
              component="label"
              title={editHoverText}
              onClick={(event) => {
                if (props.stories) {
                  editSeries(event, props.id);
                } else {
                  editStory(event, props.id);
                }
              }}>
              <EditIcon
                sx={{
                  padding: "0",
                  fontSize: "18px",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#2a57e3",
                  },
                }}
              />
            </IconButton>
            <IconButton
              aria-label="delete"
              component="label"
              title={deleteHoverText}
              onClick={(event) => {
                if (props.stories) {
                  deleteSeries(event, props.id, props.title);
                } else {
                  deleteStory(event, props.id, props.title);
                }
              }}>
              <DeleteIcon
                sx={{
                  fontSize: "18px",
                  padding: "0",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#2a57e3",
                  },
                }}
              />
            </IconButton>
          </span>
        </div>
        <DetailsSlider
          key={props.id}
          stories={props.stories}
          chapters={props.chapters}
          onStoryClick={handleClick}
          setDeleted={setWasDeleted}
          isSeries={isSeries}
          title={props.title}
          description={props.description}
        />
      </div>
    </button>
  ) : (
    ""
  );
};

export default Story;
