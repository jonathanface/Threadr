import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import {
  flipEditingSeries,
  setSeriesBeingEdited,
  setSeriesList,
} from "../../stores/seriesSlice";
import { AppDispatch, RootState } from "../../stores/store";
import {
  flipEditingStory,
  setSelectedStory,
  setStandaloneList,
  setStoryBeingEdited,
} from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { Series, Story } from "../../types";
import DetailsSlider from "./DetailsSlider";
import styles from "./story.module.css";

interface StoryBoxProps {
  data: Story | Series;
}

const StoryBox = (props: StoryBoxProps) => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const [wasDeleted, setWasDeleted] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const [isSeries, setIsSeries] = useState(false);
  const seriesList = useAppSelector((state) => state.series.seriesList);
  const standaloneList = useAppSelector(
    (state) => state.stories.standaloneList
  );

  const getStoryDetails = async (storyID: string) => {
    const url = "/api/stories/" + storyID;
    try {
      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return await response.json();
    } catch (error) {
      console.error(error);
    }
  };

  const handleClick = async (storyID: string, chapterID: string) => {
    const history = window.history;
    const newStory = await getStoryDetails(storyID);
    dispatch(setSelectedStory(newStory));
    history.pushState(
      { storyID },
      "clicked story",
      "/story/" + storyID + "?chapter=" + chapterID
    );
    dispatch(setIsLoaderVisible(true));
  };

  const editStory = (event: React.MouseEvent, storyID: string) => {
    event.stopPropagation();
    dispatch(setStoryBeingEdited(props.data as Story));
    dispatch(flipEditingStory(true));
  };

  const editSeries = (event: React.MouseEvent, seriesID: string) => {
    event.stopPropagation();
    dispatch(setSeriesBeingEdited(props.data as Series));
    dispatch(flipEditingSeries());
  };

  const deleteSeries = async (
    event: React.MouseEvent,
    id: string,
    title: string
  ) => {
    event.stopPropagation();
    const confirmText =
      "Delete series " +
      title +
      "? Any volumes assigned to it will be converted to standalone stories.";
    const conf = window.confirm(confirmText);
    if (conf) {
      dispatch(setIsLoaderVisible(true));
      try {
        const url = "/api/series/" + id;
        const response = await fetch(url, {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(JSON.stringify(errorData));
        }

        setWasDeleted(true);
        const foundSeriesIndex = seriesList.findIndex(
          (srs) => srs.series_id === id
        );
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

  const deleteStory = (event: React.MouseEvent, id: string, title: string) => {
    event.stopPropagation();
    const confirmText =
      (!props.data.stories
        ? "Delete story " + title + "?"
        : "Delete " + title + " from your series " + props.data.title + "?") +
      (props.data.series && props.data.stories.length === 1
        ? "\n\nThere are no other titles in this series, so deleting it will also remove the series."
        : "");

    const conf = window.confirm(confirmText);
    const seriesID = props.data.stories ? props.data.id : "";
    if (conf) {
      dispatch(setIsLoaderVisible(true));
      const url = "/api/stories/" + id + "?series=" + seriesID;
      fetch(url, {
        credentials: "include",
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

  const id = props.data.stories ? props.data.series_id : props.data.story_id;
  const title = props.data.stories ? props.data.series_title : props.data.title;
  const description = props.data.stories
    ? props.data.series_description
    : props.data.description;
  const editHoverText = "Edit " + title;
  const deleteHoverText = "Delete " + title;

  useEffect(() => {
    if (props.data.stories) {
      setIsSeries(true);
    } else {
      setIsSeries(false);
    }
  }, [props.data.stories]);

  return !wasDeleted ? (
    <button
      className={styles.docButton}
      onClick={
        !props.data.stories
          ? (e) => handleClick(props.data.story_id, props.data.chapters[0].id)
          : () => {}
      }
    >
      <div
        className="loading-screen"
        style={{ visibility: isStoryLoaderVisible ? "visible" : "hidden" }}
      >
        <Box className="progress-box" />
        <Box className="prog-anim-holder">
          <CircularProgress />
        </Box>
      </div>
      <div className={styles.storyBubble}>
        <img
          className={props.data.stories ? styles.seriesImage : ""}
          src={props.data.image_url}
          alt={title}
          onLoad={() => {
            setIsStoryLoaderVisible(false);
          }}
        />
        <div className={styles.storyLabel}>
          <span className={styles.title}>{title}</span>
          <span className={styles.buttons}>
            <IconButton
              aria-label="edit story"
              sx={{ padding: "0" }}
              component="label"
              title={editHoverText}
              onClick={(event) => {
                if (isSeries) {
                  editSeries(event, id);
                } else {
                  editStory(event, id);
                }
              }}
            >
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
                if (props.data.stories) {
                  deleteSeries(event, id, title);
                } else {
                  deleteStory(event, id, title);
                }
              }}
            >
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
          key={id}
          id={id}
          stories={props.data.stories}
          chapters={props.data.chapters}
          onStoryClick={handleClick}
          setDeleted={setWasDeleted}
          isSeries={isSeries}
          title={title}
          description={description}
        />
      </div>
    </button>
  ) : (
    ""
  );
};

export default StoryBox;
