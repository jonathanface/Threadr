import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { useDispatch } from 'react-redux';
import { flipEditingStoryState, setStoryEditables } from '../../stores/editingStorySlice';

import React from 'react';
import '../../css/story.css';

const DetailsSlider = (props) => {

  const dispatch = useDispatch();

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

  return (
    <div className="details-slider">
      {
        props.series && props.data && props.data.length ?
            <div className="series-listing">
              <div>Volumes:</div>
              <ul>
                {props.data.map((entry) => {
                  return <li key={entry.place} title={entry.description} onClick={(e)=> props.onStoryClick(e, entry.volume, props.title)}>
                    {entry.volume}
                    <span>
                      <IconButton className="edit-series-story" aria-label="edit story" sx={{padding:'0'}} component="label" title="edit series volume" onClick={(event)=>{editStory(event, entry.volume)}}>
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
                      <IconButton className="delete-series-story" aria-label="delete story" component="label" title="delete series entry" onClick={(event)=>{deleteStory(event, entry.volume)}}>
                        <DeleteIcon sx={{
                          'fontSize': '18px',
                          'color': '#F0F0F0',
                          '&:hover': {
                            fontWeight: 'bold',
                            color: '#2a57e3'
                          }
                        }}/>
                      </IconButton>
                    </span>
                  </li>;
                })}
              </ul>
            </div> :
            ''
      }
      <div className="details-description">{props.description}</div>
    </div>
  );
};

export default DetailsSlider;
