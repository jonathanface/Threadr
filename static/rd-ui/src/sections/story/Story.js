import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import '../../css/story.css';
import { flipCreatingNewStoryState } from '../../stores/creatingNewStorySlice';
import { setLoaderVisible } from '../../stores/displayLoaderSlice';
import { flipEditingStoryState, setStoryEditables } from '../../stores/editingStorySlice';
import { setSelectedSeries } from '../../stores/selectedSeriesSlice';
import { setSelectedStoryTitle } from '../../stores/selectedStorySlice';
import DetailsSlider from './DetailsSlider';


const Story = (props) => {
  const dispatch = useDispatch();
  const [wasDeleted, setWasDeleted] = useState(false);

  const handleClick = (event, title, series) => {
    const history = window.history;
    dispatch(setSelectedStoryTitle(encodeURIComponent(title)));
    if (series) {
      dispatch(setSelectedSeries(encodeURIComponent(series)));
    }
    history.pushState({title}, 'clicked story', '/story/' + encodeURIComponent(title) + '?chapter=1');
    dispatch(setLoaderVisible(true));
  };

  const editStory = (event, title) => {
    event.stopPropagation();
    const newProps = {};
    newProps.title = title;
    newProps.description = props.description;
    if (props.series) {
      newProps.description = props.data.find(entry => entry.volume === title).description;
    }
    newProps.series = props.series;
    newProps.seriesTitle = props.series ? props.title : "";
    newProps.portrait = props.portrait;
    dispatch(setStoryEditables(newProps));
    dispatch(flipEditingStoryState());
  }

  const deleteStory = (event, title) => {
    event.stopPropagation();
    const confirmText = (!props.series ? "Delete story " + title + "?" : "Delete " + title + " from your series " + props.title + "?") +
                        (props.series && props.data.length === 1 ? "\n\nThere are no other titles in this series, so deleting it will also remove the series.": "");

    const conf = confirm(confirmText)
    
    if (conf) {
      const url = '/api/stories/' + title + '?series=' + props.series;
      fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        if (response.ok) {
          props.setDeleted(true);
        }
      });
    }
  };

  const editHoverText = props.series ? 'Edit Series' : 'Edit Story';
  const deleteHoverText = props.series ? 'Delete Series Volume' : 'Delete Story';

  const addToSeries = (event) => {
    event.preventDefault();
    dispatch(flipCreatingNewStoryState(props.title));
  }
  
  return (
        !wasDeleted ?
            <button className="doc-button" onClick={ !props.series ? (e)=>handleClick(e, props.title) : ()=>{}}>
              <div>
                <img src={props.portrait} alt={props.title}/>
                <div className="story-label">
                  <span className="title">{props.title}</span>
                  <span className="buttons">
                    <IconButton aria-label="edit story" sx={{padding:'0'}} component="label" title={editHoverText} onClick={(event)=>{
                      if (props.series) {

                      } else {
                        editStory(event, props.title)
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
                        <IconButton aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{deleteStory(event, props.title)}}>
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
                      <IconButton onClick={addToSeries} aria-label="add story to series" sx={{padding:'0', paddingLeft:'5px'}} component="label"  title="Add Story">
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
                <DetailsSlider deleteFunc={deleteStory} editFunc={editStory} key={props.title} data={props.data} onStoryClick={handleClick} setDeleted={setWasDeleted} series={props.series} title={props.title} description={props.description} />
              </div>
            </button> : ''
  );
};

export default Story;
