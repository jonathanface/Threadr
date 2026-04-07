import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton, Tooltip } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { useWorksList } from "../../hooks/useWorksList";
import { AlertToastType } from "../../types/AlertToasts";
import type { Story } from "../../types/Story";
import { StoryOrSeriesDetailsSlider } from "../StoryOrSeriesDetailsSlider";
import styles from "./story.module.css";

interface StoryBoxProps {
  story: Story;
}

export const StoryBox = (props: StoryBoxProps) => {
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const { storiesList, setStoriesList } = useWorksList();

  const [wasDeleted, setWasDeleted] = useState(false);
  const [isSliderVisible, setIsSliderVisible] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);

  const navigate = useNavigate();

  const handleClick = async (event: React.MouseEvent, storyID: string) => {
    event.preventDefault();
    navigate(`/stories/${storyID}`);
  };

  const editStory = (event: React.MouseEvent, storyID: string) => {
    event.stopPropagation();
    navigate(`/stories/${storyID}/edit`);
  };

  const deleteStory = async (
    event: React.MouseEvent,
    id: string,
    title: string
  ) => {
    event.stopPropagation();

    const confirmText = "Delete story " + title + "?";

    const conf = window.confirm(confirmText);

    if (conf) {
      try {
        showLoader();

        const res = await api.delete(`/stories/${id}`, {
          headers: { "Content-Type": "application/json" },
        });

        // allow 200/204 as success, and also 501 (per your global validateStatus rule)
        if (![200, 204, 501].includes(res.status)) {
          const payload =
            typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          throw new Error(payload || "Unexpected delete response");
        }

        setWasDeleted(true);
        if (storiesList) {
          setStoriesList(storiesList.filter((s) => s.story_id !== id));
        }
        setAlertState({
          title: `Story "${title}" deleted`,
          message: "",
          severity: AlertToastType.success,
          open: true,
        });
      } catch (error) {
        setWasDeleted(true);
        if (axios.isAxiosError(error)) {
          console.error(
            `Error deleting story: ${error.response?.status} ${error.message}`
          );
        } else {
          console.error(`Error deleting story: ${error}`);
        }
      } finally {
        hideLoader();
      }
    }
  };

  const showSlider = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsSliderVisible(true);
  };
  const hideSlider = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsSliderVisible(false);
  };

  const id = props.story.story_id;
  const title = props.story.title;
  const description = props.story.description;
  const editHoverText = `Edit ${title}`;
  const deleteHoverText = `Delete ${title}`;

  const imageURL = props.story.image_url
    ? props.story.image_url
    : "/img/icons/story_standalone_icon.jpg";
  return !wasDeleted ? (
    <button
      type="button"
      disabled={props.story.inactive}
      onMouseEnter={showSlider}
      onMouseLeave={hideSlider}
      className={styles.storyBoxContainer}
      onClick={(event) => {
        handleClick(event, props.story.story_id);
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
          src={imageURL}
          alt={title}
          onLoad={() => {
            setIsStoryLoaderVisible(false);
          }}
        />
      </div>
      <div className={styles.storyLabel}>
        <div className={styles.title} title={title}>
          {title}
        </div>
        <span className={styles.buttons}>
          <Tooltip title={editHoverText} placement="top">
            <IconButton
              aria-label="edit story"
              sx={{ padding: "0" }}
              component="label"
              onClick={(event) => {
                editStory(event, props.story.story_id);
              }}
            >
              <EditIcon
                sx={{
                  padding: "0",
                  fontSize: "18px",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#d97706",
                  },
                }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={deleteHoverText} placement="top">
            <IconButton
              aria-label="delete"
              component="label"
              onClick={(event) => {
                deleteStory(event, id, title);
              }}
            >
              <DeleteIcon
                sx={{
                  fontSize: "18px",
                  padding: "0",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#d97706",
                  },
                }}
              />
            </IconButton>
          </Tooltip>
        </span>
      </div>
      <StoryOrSeriesDetailsSlider
        id={id}
        visible={isSliderVisible}
        onStoryClick={handleClick}
        setDeleted={setWasDeleted}
        isSeries={false}
        title={title}
        description={description}
      />
    </button>
  ) : (
    ""
  );
};
