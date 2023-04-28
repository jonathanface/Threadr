import React, {useState, useEffect} from 'react';
import {setSelectedStoryTitle} from '../../stores/selectedStorySlice';
import {setSelectedSeries} from '../../stores/selectedSeriesSlice';
import {useDispatch} from 'react-redux';
import {IconButton} from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import '../../css/story-container.css';

const StoryContainer = (props) => {
  const dispatch = useDispatch();
  const [hoverString, setHoverString] = useState('');
  const [seriesName, setSeriesName] = useState(null);

  useEffect(() => {
    console.log("p", props);
    if (props.series === true) {
      const hoverText = props.data.map((books) => {
        return books.volume;
      });
      setHoverString(hoverText.join(', '));
    } else {
      console.log("set", seriesName)
      setSeriesName(props.seriesName)
      setHoverString(props.title);
    }
  }, [props]);

  const handleClick = () => {
    const history = window.history;
    const title = props.title;
    if (props.series === false) {
      dispatch(setSelectedSeries(null));
      dispatch(setSelectedStoryTitle(encodeURIComponent(props.title)));
      history.pushState({title}, 'clicked story', '/story/' + encodeURIComponent(props.title) + '?chapter=1');
    } else {
      dispatch(setSelectedSeries(encodeURIComponent(props.title)));
      history.pushState({title}, 'clicked series', '/series/' + encodeURIComponent(props.title));
    }
  };

  const deleteStory = (event, title) => {
    event.stopPropagation();
    let url = '/api/stories/' + title;
    if (seriesName && seriesName.length) {
      url += '?series=' + seriesName
    }
    fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((response) => {
      if (response.ok) {

      }
    });
  }

  return (
    <button className="doc-button" title={hoverString} onClick={handleClick}>
      <div>
        <img src="/img/icons/default_doc_icon_blank.png" alt={props.title}/>
        {props.series === true ? <img className="series_badge" alt="series" title="series" src="/img/icons/series_icon.png"/> : ''}
      </div>
      <div className="story-text">
        <h3>{props.title}</h3>
        {props.series === false ? 
          <IconButton aria-label="remove story" component="label" onClick={(event) => {deleteStory(event, props.title)}} title="Delete Story" className="icon-delete-btn">
            <RemoveCircleOutlineIcon sx={{
              'color': '#F0F0F0',
              'fontSize': 20,
              '&:hover': {
                fontWeight: 'bold',
                color: '#2a57e3'
              }
            }}/>
          </IconButton>
        : ""}
      </div>
    </button>
  );
};
export default StoryContainer;
