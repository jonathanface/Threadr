import React from 'react';
import {IconButton} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import '../../css/story.css';

const DetailsSlider = (props) => {
    const deleteStory = (event,) => {
        event.stopPropagation();
        let url = '/api/stories/' + props.title + '?series=' + props.series;
        fetch(url, {
            method: 'DELETE',
            headers: {
            'Content-Type': 'application/json'
            }
        }).then((response) => {
            if (response.ok) {
                props.setDeleted(true)
            }
        });
    }

    const deleteHoverText = props.series ? "Delete Series" : "Delete Story"
    const editHoverText = props.series ? "Edit Series" : "Edit Story"

    return (
        <div className="details-slider">
            <div className="details-title">
                <h4>{props.title}</h4>
                <span>
                    <IconButton aria-label="edit story" component="label" title={editHoverText}>
                        <EditIcon sx={{
                            fontSize: '18px',
                            color: '#F0F0F0',
                            '&:hover': {
                                fontWeight: 'bold',
                                color: '#2a57e3'
                            }
                        }}/>
                    </IconButton>
                    { !props.series ? 
                        <IconButton aria-label="delete story" component="label" title={deleteHoverText} onClick={deleteStory}>
                            <DeleteIcon sx={{
                                fontSize: '18px',
                                color: '#F0F0F0',
                                '&:hover': {
                                    fontWeight: 'bold',
                                    color: '#2a57e3'
                                }
                            }}/>
                        </IconButton>
                        : "" }
                </span>
            </div>
            {
                props.series && props.data && props.data.length ?
                    <div className="series-listing">
                        <div>Volumes:</div>
                        <ul>
                            {props.data.map((entry) => {
                                return <li key={entry.place} onClick={(e)=> props.onStoryClick(e, entry.volume, props.title)}>{entry.volume}</li>
                            })}
                        </ul>
                        
                    </div>
                    :
                    ""
            } 
            <div className="details-description">{props.description}</div>
        </div>
    )
}

export default DetailsSlider;