import React, {useState, useEffect} from 'react';
import {setSelectedStory} from '../../stores/selectedStorySlice';
import {setSelectedSeries} from '../../stores/selectedSeriesSlice';
import {useDispatch} from 'react-redux';
import '../../css/story-container.css';

const StoryContainer = (props) => {
  const dispatch = useDispatch();
  const [hoverString, setHoverString] = useState('');

  useEffect(() => {
    if (props.series === true) {
      const hoverText = props.data.map((books) => {
        return books.volume;
      });
      setHoverString(hoverText.join(', '));
    } else {
      setHoverString(props.title);
    }
  }, [props]);

  const handleClick = () => {
    const history = window.history;
    const title = props.title;
    if (props.series === false) {
      dispatch(setSelectedSeries(null));
      dispatch(setSelectedStory(encodeURIComponent(props.title)));
      history.pushState({title}, 'clicked story', '/story/' + encodeURIComponent(props.title) + '?chapter=1');
    } else {
      dispatch(setSelectedSeries(encodeURIComponent(props.title)));
      history.pushState({title}, 'clicked series', '/series/' + encodeURIComponent(props.title));
    }
  };

  return (
    <button className="doc-button" title={hoverString} onClick={handleClick}>
      <div>
        <img src="/img/icons/default_doc_icon_blank.png" alt={props.title}/>
        {props.series === true ? <img className="series_badge" alt="series" title="series" src="/img/icons/series_icon.png"/> : ''}
      </div>
      <div>
        <h3>{props.title}</h3>
      </div>
    </button>
  );
};
export default StoryContainer;
