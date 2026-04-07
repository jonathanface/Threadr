import { Avatar, AvatarGroup, Button, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Chapter } from "../../types/Chapter";
import type { Story } from "../../types/Story";
import styles from "./details.module.css";

interface DetailsSliderProps {
  id: string;
  visible: boolean;
  stories?: Story[];
  chapters?: Chapter[];
  isSeries: boolean;
  title: string;
  description: string;
  onStoryClick?: (event: React.MouseEvent, storyID: string) => void;
  onShowMoreClick?: (event: React.MouseEvent) => void;
  setDeleted: React.Dispatch<React.SetStateAction<boolean>>;
}

export const StoryOrSeriesDetailsSlider = (props: DetailsSliderProps) => {
  const navigate = useNavigate();
  const [stories, setStories] = useState(props.stories);
  const [isSeries, setIsSeries] = useState(props.isSeries);
  const [, setTitle] = useState(props.title);
  const [isVisible, setIsVisible] = useState(false);
  const [description, setDescription] = useState(props.description);

  useEffect(() => {
    setIsVisible(props.visible); // eslint-disable-line react-hooks/set-state-in-effect
  }, [props.visible]);

  useEffect(() => {
    setTitle(props.title); // eslint-disable-line react-hooks/set-state-in-effect
    setDescription(
      props.description.length ? props.description : "No description"
    );
    if (props.stories?.length) {
      const newStories = [...props.stories].sort((a, b) => {
        if (a.place && b.place) {
          return a.place - b.place;
        }
        return 0;
      });
      setStories(newStories);
    } else if (!props.stories || !props.stories.length) {
      setStories([]);
    }
    setIsSeries(props.isSeries);
  }, [props.stories, props.title, props.description, props.isSeries]);

  return (
    <div
      className={`${styles.detailsSlider} ${isVisible ? styles.visible : ""}`}
    >
      <div className={styles.detailsDescription}>{description}</div>
      {isSeries && stories?.length ? <hr className={styles.separator} /> : null}
      <div className={styles.seriesListing}>
        {isSeries ? (
          stories?.length ? (
            <div>
              <div className={styles.storiesLabel}>Stories in this series:</div>
              <AvatarGroup
                renderSurplus={(surplus) => (
                  <button
                    type="button"
                    className={styles.moreClicker}
                    title="Click for more"
                    onClick={(event) => {
                      if (props.onShowMoreClick) {
                        props.onShowMoreClick(event);
                      }
                    }}
                  >
                    +{surplus.toString()[0]}
                  </button>
                )}
                max={4}
                total={props.stories ? props.stories.length : 0}
                className={styles.avatars}
              >
                {props.stories?.map((story) => (
                  <Tooltip
                    key={story.story_id}
                    title={story.title}
                    placement="top"
                  >
                    <Avatar
                      onClick={(event) =>
                        props.onStoryClick
                          ? props.onStoryClick(event, story.story_id)
                          : null
                      }
                      alt={story.title}
                      className={styles.avatar}
                      src={story.image_url}
                    />
                  </Tooltip>
                ))}
              </AvatarGroup>
            </div>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/series/${props.id}/add`);
              }}
              sx={{ textTransform: "none", fontSize: "0.75rem" }}
            >
              Create Story
            </Button>
          )
        ) : (
          ""
        )}
      </div>
    </div>
  );
};
