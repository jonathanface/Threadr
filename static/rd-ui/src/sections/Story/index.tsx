import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useEffect, useState } from "react";
import { DetailsSlider } from "./DetailsSlider";
import styles from "./story.module.css";
import { IsStory, Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { useFetchSeriesList } from "../../hooks/useFetchSeriesList";
//import { useFetchStoriesList } from "../../hooks/useFetchStoriesList";
import { useCurrentStoryContext } from "../../contexts/selections";
import { useLoader } from "../../hooks/useLoader";
import { useAppNavigation } from "../../hooks/useAppNavigation";


interface StoryBoxProps {
  data: Story | Series;
}

export const StoryBox = (props: StoryBoxProps) => {

  //const { seriesList, setSeriesList } = useFetchSeriesList();
  // const { storiesList, setStoriesList } = useFetchStoriesList();
  const { setCurrentStory } = useCurrentStoryContext();
  const { setIsLoaderVisible } = useLoader();
  const { setIsEditingStory, setIsEditingSeries } = useAppNavigation();

  const [wasDeleted, setWasDeleted] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const [isSeries, setIsSeries] = useState(false);

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
    setCurrentStory(newStory);
    history.pushState(
      { storyID },
      "clicked story",
      "/story/" + storyID + "?chapter=" + chapterID
    );
    setIsLoaderVisible(true);
  };

  const editStory = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsEditingStory(props.data as Story);
  };

  const editSeries = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsEditingSeries(props.data as Series);
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
      setIsLoaderVisible(true);
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
        // const foundSeriesIndex = seriesList?.findIndex(
        //   (srs) => srs.series_id === id
        // );
        // if (storiesList && seriesList && foundSeriesIndex && foundSeriesIndex !== -1) {
        //   const newStandaloneList = [...storiesList];
        //   seriesList[foundSeriesIndex].stories.forEach((story) => {
        //     const newStory = { ...story };
        //     delete newStory.series_id;
        //     newStandaloneList.push(newStory);
        //   });
        //   setStoriesList(newStandaloneList);

        //   const newSeriesList = [...seriesList];
        //   newSeriesList.splice(foundSeriesIndex, 1);
        //   setSeriesList(newSeriesList);
        // }
        setIsLoaderVisible(false);
      } catch (error) {
        console.error("Error fetching data: ", error);
        //const errorData = error.response ? JSON.parse(error.message) : {};
        setIsLoaderVisible(false);
      }
    }
  };

  const deleteStory = (event: React.MouseEvent, id: string, title: string) => {
    event.stopPropagation();

    const confirmText =
      (IsStory(props.data)
        ? "Delete story " + title + "?"
        : "Delete " +
        title +
        " from your series " +
        props.data.series_title +
        "?") +
      (!IsStory(props.data) && props.data.stories.length === 1
        ? "\n\nThere are no other titles in this series, so deleting it will also remove the series."
        : "");

    const conf = window.confirm(confirmText);
    const seriesID = !IsStory(props.data) ? props.data.series_id : "";
    if (conf) {
      setIsLoaderVisible(true);
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
        setIsLoaderVisible(false);
      });
    }
  };

  const id = !IsStory(props.data) ? props.data.series_id : props.data.story_id;
  const title = !IsStory(props.data)
    ? props.data.series_title
    : props.data.title;
  const description = !IsStory(props.data)
    ? props.data.series_description
    : props.data.description;
  const editHoverText = "Edit " + title;
  const deleteHoverText = "Delete " + title;

  useEffect(() => {
    if (!IsStory(props.data)) {
      setIsSeries(true);
    } else {
      setIsSeries(false);
    }
  }, [props.data]);

  return !wasDeleted ? (
    <button
      className={styles.docButton}
      onClick={() => {
        if (IsStory(props.data)) {
          handleClick(props.data.story_id, props.data.chapters[0].id);
        }
      }}
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
          className={!IsStory(props.data) ? styles.seriesImage : ""}
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
                  editSeries(event);
                } else {
                  editStory(event);
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
                if (!IsStory(props.data)) {
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
          stories={!IsStory(props.data) ? props.data.stories : undefined}
          chapters={IsStory(props.data) ? props.data.chapters : undefined}
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
