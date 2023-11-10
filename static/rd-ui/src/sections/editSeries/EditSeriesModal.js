import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import PortraitDropper from '../portraitdropper/PortraitDropper';

const EditSeriesModal = () => {
    const isEditingSeries = useSelector((state) => state.series.isEditingSeries);
    const [formInput, setFormInput] = useState(new Map());
    const [imageURL, setImageURL] = useState();

    const handleClose = () => {

    }

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

    return (
        <div>
            <Dialog open={isEditingSeries} onClose={handleClose}>
                <DialogTitle>EditSeries</DialogTitle>
                <DialogContent>
                    <Box component="form">
                        <div>
                            <h3>Image for Your Series</h3>
                            <PortraitDropper imageURL={imageURL} name="Series Image" onComplete={processImage}/>
                            <TextField
                                onChange={(event) => {
                                    setFormInput((prevFormInput) => ({
                                    ...prevFormInput,
                                    title: event.target.value
                                    }))
                                }}
                                autoFocus
                                label="Title"
                                helperText="Cannot be blank"
                            />
                        </div>
                        <div>
                            <TextField
                                onChange={(event) => {
                                    setFormInput((prevFormInput) => ({
                                    ...prevFormInput,
                                    description: event.target.value
                                    }));
                                }}
                                label="Description"
                                helperText="Cannot be blank"
                                multiline
                                maxRows={4}
                            />
                        </div>
                    </Box>
                </DialogContent>
            </Dialog>
        </div>
    );          
}

export default EditSeriesModal;