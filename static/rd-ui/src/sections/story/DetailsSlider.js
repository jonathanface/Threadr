
import React, { useEffect, useState } from 'react';
import '../../css/story.css';

const DetailsSlider = (props) => {
  const [stories, setStories] = useState(props.stories);
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);

  useEffect(() => {
    setTitle(props.title);
    setDescription(props.description);
    if (props.stories && props.stories.length) {
      const newStories = [...props.stories].sort((a, b) => a.place - b.place);
      setStories(newStories);
    }
  }, [props.stories, props.title, props.description]);

  return (
    <div className="details-slider">
      <div className="details-description">{description}</div>
      {
        stories && stories.length ?
            <div className="series-listing">
              <div>Volumes:</div>
              <ul>
                {stories.map((entry) => {
                  return <li key={entry.place} title={entry.description} onClick={(e)=> props.onStoryClick(e, entry.story_id, title)}>
                    <span>
                      <img className="series-story-thumbnail" src={entry.image_url} alt={entry.title} />
                      {entry.title}
                    </span>
                  </li>;
                })}
              </ul>
            </div> :
            ''
      }
    </div>
  );
};

export default DetailsSlider;
