import { useEffect, useState } from "react";
import { Chapter, Story } from "../../types";
import styles from "./story.module.css";

interface DetailsSliderProps {
  id: string;
  stories?: Story[];
  chapters?: Chapter[];
  isSeries: boolean;
  title: string;
  description: string;
  onStoryClick: Function;
  setDeleted: Function;
}

const DetailsSlider = (props: DetailsSliderProps) => {
  const [stories, setStories] = useState(props.stories);
  const [isSeries, setIsSeries] = useState(props.isSeries);
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);

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
    <div className={styles.detailsSlider}>
      <div className={styles.detailsDescription}>{description}</div>
      <div className={styles.seriesListing}>
        {isSeries ? (
          stories && stories.length ? (
            <div>
              <div>Volumes:</div>
              <ul>
                {stories.map((entry) => {
                  const firstChapter = entry.chapters[0].id;
                  return (
                    <li
                      key={entry.story_id}
                      title={entry.description}
                      onClick={(e) =>
                        props.onStoryClick(entry.story_id, firstChapter)
                      }
                    >
                      <span>
                        <img
                          className={styles.seriesStoryThumbnail}
                          src={entry.image_url}
                          alt={entry.title}
                        />
                        {entry.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
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

export default DetailsSlider;
