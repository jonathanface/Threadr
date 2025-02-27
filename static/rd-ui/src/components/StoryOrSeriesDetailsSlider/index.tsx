import { useEffect, useState } from "react";
import styles from "./details.module.css";
import { Story } from "../../types/Story";
import { Chapter } from "../../types/Chapter";
import { Avatar, AvatarGroup } from "@mui/material";

interface DetailsSliderProps {
  id: string;
  visible: boolean;
  stories?: Story[];
  chapters?: Chapter[];
  isSeries: boolean;
  title: string;
  description: string;
  onStoryClick?: (event: React.MouseEvent, storyID: string) => void;
  onShowMoreClick: (event: React.MouseEvent) => void;
  setDeleted: React.Dispatch<React.SetStateAction<boolean>>;
}

export const StoryOrSeriesDetailsSlider = (props: DetailsSliderProps) => {
  const [stories, setStories] = useState(props.stories);
  const [isSeries, setIsSeries] = useState(props.isSeries);
  const [, setTitle] = useState(props.title);
  const [isVisible, setIsVisible] = useState(false);
  const [description, setDescription] = useState(props.description);

  useEffect(() => {
    setIsVisible(props.visible);
  }, [props.visible]);

  useEffect(() => {
    setTitle(props.title);
    setDescription(
      props.description.length ? props.description : "No description"
    );
    if (props.stories && props.stories.length) {
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
    <div className={`${styles.detailsSlider} ${isVisible ? styles.visible : ""}`}>
      <div className={styles.detailsDescription}>{description}</div>
      <div className={styles.seriesListing}>
        {isSeries ? (
          stories && stories.length ? (
            <div>
              <AvatarGroup renderSurplus={(surplus) => {

                return <span className={styles.moreClicker} title="Click for more" onClick={(event) => props.onShowMoreClick(event)}>+{surplus.toString()[0]}</span>;
              }
              } max={4} total={props.stories ? props.stories.length : 0} className={styles.avatars}>
                {
                  props.stories?.map((story, index) => (
                    <Avatar
                      onClick={(event) => props.onStoryClick ? props.onStoryClick(event, story.story_id) : null}
                      title={story.title}
                      alt={story.title}
                      className={styles.avatar}
                      key={index}
                      src={story.image_url}
                    />
                  ))
                }
              </AvatarGroup>

            </div>
          ) : (
            "No stories assigned."
          )
        ) : (
          ""
        )}
      </div>
    </div>
  );
};
