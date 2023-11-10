import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import React, { useState } from 'react';
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

  const handleClick = (event, storyID) => {
    const history = window.history;
    dispatch(setSelectedStory(encodeURIComponent(storyID)));
    history.pushState({storyID}, 'clicked story', '/story/' + encodeURIComponent(storyID) + '?chapter=1');
    dispatch(setIsLoaderVisible(true));
  };

  const editStory = (event, storyID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.id = storyID;
    const selected = props.volumes ? props.volumes.find((volume) => volume.id === storyID) : props;
    const seriesToAppend = props.volumes ? selected.series_id : null;
    newProps.title = selected.title;
    newProps.description = selected.description;
    if (props.volumes) {
      newProps.series_id = props.volumes[0].series_id;
    }
    newProps.image = selected.image;
    dispatch(setStoryEditables(newProps));
    dispatch(flipEditingStory(seriesToAppend));
  };

  const editSeries = (event, seriesID) => {
    event.stopPropagation();
    const newProps = {};
    console.log("new", newProps);
    newProps.id = seriesID;
    newProps.volumes = props.volumes;
    newProps.title = props.title;
    newProps.image = props.image;
    dispatch(setSeriesEditables(newProps));
    dispatch(flipEditingSeries());
  };

  const deleteStory = (event, id, title) => {
    event.stopPropagation();
    const confirmText = (!props.volumes ? 'Delete story ' + title + '?' : 'Delete ' + title + ' from your series ' + props.title + '?') +
                        (props.series && props.volumes.length === 1 ? '\n\nThere are no other titles in this series, so deleting it will also remove the series.': '');

    const conf = window.confirm(confirmText);
    const seriesID = props.volumes ? props.id : '';
    if (conf) {
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

  return (

        !wasDeleted ?
            <button className="doc-button" onClick={ !props.volumes ? (e)=>handleClick(e, props.id) : ()=>{}}>
              <div style={{visibility: isStoryLoaderVisible ? 'visible' : 'hidden'}}>
                <Box className="progress-box"/>
                <Box className="prog-anim-holder">
                  <CircularProgress />
                </Box>
              </div>
              <div className="storyBubble">
                <img src={props.image} alt={props.title} onLoad={() => {setIsStoryLoaderVisible(false)}}/>
                <div className="story-label">
                  <span className="title">{props.title}</span>
                  <span className="buttons">
                    <IconButton aria-label="edit story" sx={{padding: '0'}} component="label" title={editHoverText} onClick={(event)=>{
                      if (props.volumes) {
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
                    { !props.volumes ?
                        <IconButton aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{deleteStory(event, props.id, props.title);}}>
                          <DeleteIcon sx={{
                            'fontSize': '18px',
                            'color': '#F0F0F0',
                            '&:hover': {
                              fontWeight: 'bold',
                              color: '#2a57e3'
                            }
                          }}/>
                        </IconButton> :
                        '' }
                    { props.volumes ?
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
                <DetailsSlider deleteFunc={deleteStory} editFunc={editStory} key={props.id} volumes={props.volumes} onStoryClick={handleClick} setDeleted={setWasDeleted} series_id={props.id} title={props.title} description={props.description} />
              </div>
            </button> : ''
  );
};

export default Story;
