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
import { useLoader } from "../../hooks/useLoader";
import { useNavigate } from "react-router-dom";
import { useWorksList } from "../../hooks/useWorksList";

interface StoryBoxProps {
  itemData: Story | Series;
}

export const StoryBox = (props: StoryBoxProps) => {
  const { showLoader, hideLoader } = useLoader();
  const { seriesList, storiesList, setSeriesList, setStoriesList } = useWorksList();

  const [wasDeleted, setWasDeleted] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const [isSeries, setIsSeries] = useState(false);

  const navigate = useNavigate();

  const handleClick = async (storyID: string, chapterID: string) => {
    navigate(`/stories/${storyID}?chapter=${chapterID}`);
  };

  const editStory = (event: React.MouseEvent) => {
    event.stopPropagation();
    //setIsEditingStory(props.data as Story);
  };

  const editSeries = (event: React.MouseEvent) => {
    event.stopPropagation();
    //setIsEditingSeries(props.data as Series);
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
      try {
        showLoader();
        const url = "/api/series/" + id;
        const response = await fetch(url, {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          if (response.status !== 501) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
          }
        }

        setWasDeleted(true);
        const foundSeriesIndex = seriesList?.findIndex(
          (srs) => srs.series_id === id
        );
        if (storiesList && seriesList && foundSeriesIndex && foundSeriesIndex !== -1) {
          const newStandaloneList = [...storiesList];
          seriesList[foundSeriesIndex].stories.forEach((story) => {
            const newStory = { ...story };
            delete newStory.series_id;
            newStandaloneList.push(newStory);
          });
          setStoriesList(newStandaloneList);

          const newSeriesList = [...seriesList];
          newSeriesList.splice(foundSeriesIndex, 1);
          setSeriesList(newSeriesList);
        }
      } catch (error) {
        console.error(`Error deleting series: ${error}`);
      } finally {
        hideLoader();
      }
    }
  };

  const deleteStory = async (event: React.MouseEvent, id: string, title: string) => {
    event.stopPropagation();

    const confirmText =
      (IsStory(props.itemData)
        ? "Delete story " + title + "?"
        : "Delete " +
        title +
        " from your series " +
        props.itemData.series_title +
        "?") +
      (!IsStory(props.itemData) && props.itemData.stories.length === 1
        ? "\n\nThere are no other titles in this series, so deleting it will also remove the series."
        : "");

    const conf = window.confirm(confirmText);
    const seriesID = !IsStory(props.itemData) ? props.itemData.series_id : "";
    if (conf) {
      try {
        showLoader();
        const url = `/api/stories/${id}?series=${seriesID}`;
        const response = await fetch(url, {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          if (response.status !== 501) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
          }
        }
        setWasDeleted(true);
      } catch (error) {
        console.error(`Error deleting story ${error}`);
      } finally {
        hideLoader();
      }
    }
  };

  const id = !IsStory(props.itemData) ? props.itemData.series_id : props.itemData.story_id;
  const title = !IsStory(props.itemData)
    ? props.itemData.series_title
    : props.itemData.title;
  const description = !IsStory(props.itemData)
    ? props.itemData.series_description
    : props.itemData.description;
  const editHoverText = "Edit " + title;
  const deleteHoverText = "Delete " + title;

  useEffect(() => {
    if (!IsStory(props.itemData)) {
      setIsSeries(true);
    } else {
      setIsSeries(false);
    }
  }, [props.itemData]);

  return !wasDeleted ? (
    <button
      className={styles.docButton}
      onClick={() => {
        if (IsStory(props.itemData)) {
          handleClick(props.itemData.story_id, props.itemData.chapters[0].id);
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
          className={!IsStory(props.itemData) ? styles.seriesImage : ""}
          src={props.itemData.image_url}
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
                if (!IsStory(props.itemData)) {
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
          stories={!IsStory(props.itemData) ? props.itemData.stories : undefined}
          chapters={IsStory(props.itemData) ? props.itemData.chapters : undefined}
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
