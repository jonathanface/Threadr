import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import '../../css/story.css';
import { flipEditingSeries, setSeriesEditables } from '../../stores/seriesSlice';
import { flipCreatingNewStory, flipEditingStory, setSelectedStory, setStoryEditables } from '../../stores/storiesSlice';
import { setIsLoaderVisible } from '../../stores/uiSlice';
import DetailsSlider from './DetailsSlider';

const Story = (props) => {
  const dispatch = useDispatch();
  const [wasDeleted, setWasDeleted] = useState(false);
  const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);
  const [isSeries, setIsSeries] = useState(false);

  const handleClick = (event, storyID) => {
    const history = window.history;
    dispatch(setSelectedStory(encodeURIComponent(storyID)));
    history.pushState({storyID}, 'clicked story', '/story/' + encodeURIComponent(storyID) + '?chapter=1');
    dispatch(setIsLoaderVisible(true));
  };

  const editStory = (event, storyID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.story_id = storyID;
    const selected = props.stories ? props.stories.find((volume) => volume.story_id === storyID) : props;
    const seriesToAppend = props.stories ? selected.series_id : null;
    newProps.title = selected.title;
    newProps.description = selected.description;
    if (props.stories) {
      newProps.series_id = props.stories[0].series_id;
    }
    newProps.image_url = selected.image_url;
    dispatch(setStoryEditables(newProps));
    dispatch(flipEditingStory(seriesToAppend));
  };

  const editSeries = (event, seriesID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.series_id = seriesID;
    newProps.stories = props.stories;
    newProps.series_title = props.title;
    newProps.series_description = props.description;
    newProps.image_url = props.image_url;
    dispatch(setSeriesEditables(newProps));
    dispatch(flipEditingSeries());
  };

  const deleteStory = (event, id, title) => {
    event.stopPropagation();
    const confirmText = (!props.stories ? 'Delete story ' + title + '?' : 'Delete ' + title + ' from your series ' + props.title + '?') +
                        (props.series && props.stories.length === 1 ? '\n\nThere are no other titles in this series, so deleting it will also remove the series.': '');

    const conf = window.confirm(confirmText);
    const seriesID = props.stories ? props.id : '';
    if (conf) {
      dispatch(setIsLoaderVisible(true));
      const url = '/api/stories/' + id + '?series=' + seriesID;
      fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        if (response.ok) {
          setWasDeleted(true);
        }
        dispatch(setIsLoaderVisible(false));
      });
    }
  };

  const editHoverText = 'Edit ' + props.title;
  const deleteHoverText = 'Delete ' + props.title;
  const addHoverText = 'Add volume to ' + props.title;

  const addToSeries = (event, id) => {
    event.preventDefault();
    dispatch(flipCreatingNewStory(id));
  };

  useEffect(() => {
    if (props.stories) {
      setIsSeries(true);
    } else {
      setIsSeries(false);
    }
  }, [props.stories]); 

  return (
        !wasDeleted ?
            <button className="doc-button" onClick={ !props.stories ? (e)=>handleClick(e, props.id) : ()=>{}}>
              <div className="loading-screen" style={{visibility: isStoryLoaderVisible ? 'visible' : 'hidden'}}>
                <Box className="progress-box"/>
                <Box className="prog-anim-holder">
                  <CircularProgress />
                </Box>
              </div>
              <div className="storyBubble">
                <img src={props.image_url} alt={props.title} onLoad={() => {setIsStoryLoaderVisible(false)}}/>
                <div className="story-label">
                  <span className="title">{props.title}</span>
                  <span className="buttons">
                    <IconButton aria-label="edit story" sx={{padding: '0'}} component="label" title={editHoverText} onClick={(event)=>{
                      if (props.stories) {
                        editSeries(event, props.id);
                      } else {
                        editStory(event, props.id);
                      }
                    }}>
                      <EditIcon sx={{
                        'padding': '0',
                        'fontSize': '18px',
                        'color': '#F0F0F0',
                        '&:hover': {
                          fontWeight: 'bold',
                          color: '#2a57e3'
                        }
                      }}/>
                    </IconButton>
                    { !props.stories ?
                        <IconButton aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{deleteStory(event, props.id, props.title);}}>
                          <DeleteIcon sx={{
                            'fontSize': '18px',
                            'padding': '0',
                            'color': '#F0F0F0',
                            '&:hover': {
                              fontWeight: 'bold',
                              color: '#2a57e3'
                            }
                          }}/>
                        </IconButton> :
                        '' }
                    { props.stories ?
                      <IconButton onClick={(event) => {addToSeries(event, props.id)}} aria-label="add story to series" sx={{padding: '0', paddingLeft: '5px'}} component="label" title={addHoverText}>
                        <AddIcon sx={{
                          'padding': '0',
                          'color': '#F0F0F0',
                          'fontSize': '24px',
                          '&:hover': {
                            fontWeight: 'bold',
                            color: '#2a57e3',
                          }
                        }}/>
                      </IconButton> : ''
                    }
                  </span>
                </div>
                <DetailsSlider deleteFunc={deleteStory} editFunc={editStory} key={props.id} stories={props.stories} onStoryClick={handleClick} setDeleted={setWasDeleted} isSeries={isSeries} title={props.title} description={props.description} />
              </div>
            </button> : ''
  );
};

export default Story;
