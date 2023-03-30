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
                    width:'100%',
                    color:'#FFF',
                    padding:'4px'
                },
                border:'1px solid #FFF'
            }}
            endAdornment={
              <InputAdornment position="end">
                <IconButton
                  aria-label="toggle password visibility"
                  onClick={()=>{props.toggleState()}}
                  edge="end">
                    <CancelIcon sx={{color:"#FFF", cursor:'pointer'}}/>
                </IconButton>
              </InputAdornment>
            }
            onKeyUp={(event)=>props.onChange(event)}
          /> : <Button size="small" variant="text" endIcon={<AddBoxIcon />} onClick={()=>{props.toggleState()}}>Add Chapter</Button>
            
        }>
            
            
        </TreeItem>
    );
}

export default EditableTreeItem;
