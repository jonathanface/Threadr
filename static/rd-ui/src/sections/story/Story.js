import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import '../../css/story.css';
import { setLoaderVisible } from '../../stores/displayLoaderSlice';
import { setSelectedSeries } from '../../stores/selectedSeriesSlice';
import { flipCreatingNewStory, flipEditingStory, setSelectedStory, setStoryEditables } from '../../stores/storiesSlice';
import DetailsSlider from './DetailsSlider';

const Story = (props) => {
  const dispatch = useDispatch();
  const [wasDeleted, setWasDeleted] = useState(false);

  const handleClick = (event, storyID, series) => {
    console.log("props", storyID)
    const history = window.history;
    dispatch(setSelectedStory(encodeURIComponent(storyID)));
    if (series) {
      dispatch(setSelectedSeries(encodeURIComponent(series)));
    }
    history.pushState({storyID}, 'clicked story', '/story/' + encodeURIComponent(storyID) + '?chapter=1');
    dispatch(setLoaderVisible(true));
  };

  const editStory = (event, storyID) => {
    event.stopPropagation();
    const newProps = {};
    newProps.storyID = storyID;
    newProps.title = props.title;
    newProps.description = props.description;
    if (props.series) {
      newProps.description = props.data.find(entry => entry.volume === storyID).description;
    }
    newProps.series = props.series;
    newProps.seriesID = props.seriesID ? props.storyID : "";
    newProps.portrait = props.portrait;
    dispatch(setStoryEditables(newProps));
    dispatch(flipEditingStory());
  }

  const deleteStory = (event, id, title) => {
    event.stopPropagation();
    const confirmText = (!props.series ? "Delete story " + title + "?" : "Delete " + title + " from your series " + props.title + "?") +
                        (props.series && props.data.length === 1 ? "\n\nThere are no other titles in this series, so deleting it will also remove the series.": "");

    const conf = confirm(confirmText)
    const seriesID = props.seriesID && props.seriesID.length ? props.seriesID.length : ""
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

  const editHoverText = props.series ? 'Edit Series' : 'Edit Story';
  const deleteHoverText = props.series ? 'Delete Series Volume' : 'Delete Story';

  const addToSeries = (event) => {
    event.preventDefault();
    dispatch(flipCreatingNewStory(props.title));
  }
  
  return (
        !wasDeleted ?
            <button className="doc-button" onClick={ !props.series ? (e)=>handleClick(e, props.id) : ()=>{}}>
              <div>
                <img src={props.portrait} alt={props.title}/>
                <div className="story-label">
                  <span className="title">{props.title}</span>
                  <span className="buttons">
                    <IconButton aria-label="edit story" sx={{padding:'0'}} component="label" title={editHoverText} onClick={(event)=>{
                      if (props.series) {

                      } else {
                        editStory(event, props.id)
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
                    { !props.series ?
                        <IconButton aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{deleteStory(event, props.id, props.title)}}>
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
                    { props.series ?
                      <IconButton onClick={addToSeries} aria-label="add story to series" sx={{padding:'0', paddingLeft:'5px'}} component="label"  title="Add Series Volume">
                        <AddIcon sx={{
                          'padding': '0',
                          'color': '#F0F0F0',
                          'fontSize': '24px',
                          '&:hover': {
                            fontWeight: 'bold',
                            color: '#2a57e3',
                          }
                        }}/>
                      </IconButton> : ""
                    }
                  </span>
                </div>
                <DetailsSlider deleteFunc={deleteStory} editFunc={editStory} key={props.id} data={props.data} onStoryClick={handleClick} setDeleted={setWasDeleted} series={props.series} title={props.title} description={props.description} />
              </div>
            </button> : ''
  );
};

export default Story;
