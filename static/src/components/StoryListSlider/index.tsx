import { useEffect, useState } from "react";
import styles from "./list.module.css";
import {
  Avatar,
  Box,
  IconButton,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { Series } from "../../types/Series";
import CloseIcon from "@mui/icons-material/Close";
import { Story } from "../../types/Story";

interface StoryListSliderProps {
  series: Series;
  visible: boolean;
  onStoryClick: (event: React.MouseEvent, storyID: string) => void;
  onClose: () => void;
}

export const StoryListSlider = (props: StoryListSliderProps) => {
  const [stories, setStories] = useState<Story[] | null>(props.series.stories);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(props.visible); // eslint-disable-line react-hooks/set-state-in-effect
  }, [props.visible]);

  useEffect(() => {
    if (props.series.stories && props.series.stories.length) {
      const newStories = [...props.series.stories].sort((a, b) => {
        if (a.place && b.place) {
          return a.place - b.place;
        }
        return 0;
      });
      setStories(newStories); // eslint-disable-line react-hooks/set-state-in-effect
    } else if (!props.series.stories || !props.series.stories.length) {
      setStories([]);
    }
  }, [props.series]);

  return (
    <div
      className={`${styles.detailsSlider} ${isVisible ? styles.visible : ""}`}
    >
      <Box className={styles.header}>
        <IconButton
          onClick={() => {
            props.onClose();
          }}
          className={styles.closer}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <List>
        {stories
          ? stories.map((story) => (
              <Tooltip key={story.story_id} title={story.title} placement="left">
                <ListItemButton
                  disabled={story.inactive}
                  className={styles.storyItem}
                  onClick={(event) => {
                    props.onStoryClick(event, story.story_id);
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      className={styles.avatar}
                      alt={story.title}
                      src={story.image_url}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primary={story.title}
                    className={styles.storyItemText}
                  />
                </ListItemButton>
              </Tooltip>
            ))
          : "No stories added yet"}
      </List>
    </div>
  );
};
