import React from 'react';
import TreeItem from '@mui/lab/TreeItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import AddBoxIcon from '@mui/icons-material/AddBox';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputAdornment from '@mui/material/InputAdornment';
import CancelIcon from '@mui/icons-material/Cancel';

const EditableTreeItem = (props) => {
  return (
    <TreeItem className="chapter-entry" nodeId="wrapped_item" label={
            props.isCreating ? <OutlinedInput defaultValue={props.defaultVal} type='text' sx={{
              '.MuiOutlinedInput-input': {
                width: '100%',
                color: '#FFF',
                padding: '4px'
              },
              'border': '1px solid #FFF'
            }}
            endAdornment={
              <InputAdornment position="end">
                <IconButton aria-label="cancel" onClick={()=>{props.toggleState();}} edge="end">
                  <CancelIcon sx={{color: '#FFF', cursor: 'pointer'}}/>
                </IconButton>
              </InputAdornment>
            }
            onKeyUp={(event)=>props.onChange(event)}
            /> : <div onClick={()=>{props.toggleState();}}>
              <Button size="small" aria-label="add chapter" variant="text">New Chapter</Button>
              <IconButton edge="end" size="small" aria-label="add chapter" sx={{marginTop: '2px', marginRight: '0px'}}>
                <AddBoxIcon fontSize="small" className={'menu-icon'}/>
              </IconButton>
            </div>

    }>


    </TreeItem>
  );
};

export default EditableTreeItem;
