import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import React from 'react';
import '../../css/story.css';

const DetailsSlider = (props) => {

  const deleteStory = (event, title) => {
    console.log("data", props.data)
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

  const deleteHoverText = props.series ? 'Delete Series Volume' : 'Delete Story';
  const editHoverText = props.series ? 'Edit Series' : 'Edit Story';

  return (
    <div className="details-slider">
      <div className="details-title">
        <h4>{props.title}</h4>
        <span>
          <IconButton aria-label="edit story" sx={{padding:'0'}} component="label" title={editHoverText}>
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
          <IconButton aria-label="add story to series" sx={{padding:'0', paddingLeft:'5px'}} component="label"  title="Add Story">
            <AddIcon sx={{
              'padding': '0',
              'color': '#F0F0F0',
              'fontSize': '24px',
              '&:hover': {
                fontWeight: 'bold',
                color: '#2a57e3',
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
        </span>
      </div>
      {
                props.series && props.data && props.data.length ?
                    <div className="series-listing">
                      <div>Volumes:</div>
                      <ul>
                        {props.data.map((entry) => {
                          return <li key={entry.place} onClick={(e)=> props.onStoryClick(e, entry.volume, props.title)}>
                            {entry.volume}
                            <IconButton className="delete-series-story" aria-label="delete story" component="label" title={deleteHoverText} onClick={(event)=>{deleteStory(event, entry.volume)}}>
                              <DeleteIcon sx={{
                                'fontSize': '18px',
                                'color': '#F0F0F0',
                                '&:hover': {
                                  fontWeight: 'bold',
                                  color: '#2a57e3'
                                }
                              }}/>
                            </IconButton>
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
