import React, { useEffect, useState } from "react";
import "../../css/story.css";

const DetailsSlider = (props) => {
  const [stories, setStories] = useState(props.stories);
  const [isSeries, setIsSeries] = useState(props.isSeries);
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);

  useEffect(() => {
    setTitle(props.title);
    setDescription(props.description.length ? props.description : "No description");
    if (props.stories && props.stories.length) {
      const newStories = [...props.stories].sort((a, b) => a.place - b.place);
      setStories(newStories);
    } else if (!props.stories || !props.stories.length) {
      setStories([]);
    }
    setIsSeries(props.isSeries);
  }, [props.stories, props.title, props.description, props.isSeries]);

  return (
    <div className="details-slider">
      <div className="details-description">{description}</div>

      <div className="series-listing">
        {isSeries ? (
          stories && stories.length ? (
            <div>
              <div>Volumes:</div>
              <ul>
                {stories.map((entry) => {
                  const firstChapter = entry.chapters[0].id;
                  return (
                    <li
                      key={entry.place}
                      title={entry.description}
                      onClick={(e) => props.onStoryClick(e, entry.story_id, entry.title, firstChapter)}>
                      <span>
                        <img className="series-story-thumbnail" src={entry.image_url} alt={entry.title} />
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
