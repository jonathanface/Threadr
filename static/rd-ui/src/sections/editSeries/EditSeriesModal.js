import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import React, { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { useDispatch, useSelector } from 'react-redux';
import '../../css/edit-series.css';
import { flipEditingSeries } from '../../stores/seriesSlice';
import PortraitDropper from '../portraitdropper/PortraitDropper';


const EditSeriesModal = () => {
    const dispatch = useDispatch();
    const isEditingSeries = useSelector((state) => state.series.isEditingSeries);
    const editables = useSelector((state) => state.series.editables);
    const [volumes, setVolumes] = useState([])

    const handleClose = () => {
        dispatch(flipEditingSeries());
    }
    
    useEffect(() => {
        if (editables.volumes) {
            const volumes = editables.volumes.slice();
            setVolumes(volumes.sort((a, b) => a.place - b.place));
        }
    }, [editables.volumes]);

    const processImage = (acceptedFiles) => {
        acceptedFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onabort = () => console.log('file reading was aborted');
          reader.onerror = () => console.error('file reading has failed');
          reader.onload = () => {
            const newFormData = new FormData();
            newFormData.append('file', file, 'temp'+getBlobExtension(file.type));
            setFormInput((prevFormInput) => ({
              ...prevFormInput, // spread previous form input
              image: newFormData, // set new image data
            }));
          };
          reader.readAsArrayBuffer(file);
        });
    };

    const onDragEnd = (result) => {
        if (!result.destination) {
          return;
        }
        const newVolumes = Array.from(volumes);
        const [reorderedItem] = newVolumes.splice(result.source.index, 1);
        newVolumes.splice(result.destination.index, 0, reorderedItem);
        const updatedVolumes = newVolumes.map((vol, idx) => {
            return { ...vol, place: idx+1 };
        });
        setVolumes(updatedVolumes);
    };
  

    return (
        <div>
            <Dialog open={isEditingSeries} onClose={handleClose}>
                <DialogTitle>Edit Series</DialogTitle>
                <DialogContent>
                    <Box component="form">
                        <div>
                            <h3>Image for Your Series</h3>
                            <PortraitDropper imageURL={editables.image} name="Series Image" onComplete={processImage}/>
                            <TextField
                                onChange={(event) => {
                                    setFormInput((prevFormInput) => ({
                                    ...prevFormInput,
                                    title: event.target.value
                                    }))
                                }}
                                autoFocus
                                label="Title"
                                value={editables.title}
                                helperText="Cannot be blank"
                            />
                        </div>
                        <div>
                            <h3>Volumes</h3>
                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="droppable">
                                    {(provided) => (
                                        <div {...provided.droppableProps} ref={provided.innerRef}>
                                            {volumes.map((entry, index) => (
                                                <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                    {(provided) => (
                                                        <div className="edit-series-volumes"
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                        >
                                                            {<div><img src={entry.image} alt={entry.title}/><span>{entry.title}</span></div>}
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        </div>
                    </Box>
                </DialogContent>
            </Dialog>
        </div>
    );          
}

export default EditSeriesModal;