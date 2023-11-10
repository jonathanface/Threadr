import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';

import React from 'react';
import '../../css/story.css';

const DetailsSlider = (props) => {
  return (
    <div className="details-slider">
      {
        props.volumes && props.volumes.length ?
            <div className="series-listing">
              <div>Volumes:</div>
              <ul>
                {props.volumes.map((entry) => {
                  const editHoverText = "Edit " + entry.title;
                  const deleteHoverText = "Delete " + entry.title;
                  return <li key={entry.place} title={entry.description} onClick={(e)=> props.onStoryClick(e, entry.id, props.title)}>
                    <span>
                      <img className="series-story-thumbnail" src={entry.image} alt={entry.title} />
                      {entry.title}
                    </span>
                    <span>
                      <IconButton className="edit-series-story" aria-label="edit story" sx={{padding: '0'}} component="label" title={editHoverText} onClick={(event)=>{props.editFunc(event, entry.id);}}>
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
                      <IconButton className="delete-series-story" aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{props.deleteFunc(event, entry.id);}}>
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
