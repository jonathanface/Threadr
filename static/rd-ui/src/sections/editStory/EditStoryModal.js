import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { flipEditingStoryState } from '../../stores/editingStorySlice';

const EditStory = () => {
    
    const [series, setSeries] = useState([]);
    const isEditingStory = useSelector((state) => state.isEditingStory.isOpen);
    const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
    const dispatch = useDispatch();

    const initMap = new Map();
    const [formInput, setFormInput] = React.useState(initMap);
    const [areErrors, setAreErrors] = React.useState(false);
    const [currentError, setCurrentError] = React.useState('');


    const editables = useSelector((state) => state.isEditingStory.editables);
    const [isInASeries, setIsInASeries] = useState(editables.series);

    const getSeries = () => {
        fetch('/api/series').then((response) => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Fetch problem series ' + response.status);
        }).then((data) => {
            const reduced = data.reduce((accumulator, currentValue) => {
                if (!accumulator.series[currentValue.series_title]) {
                    accumulator.series[currentValue.series_title] = 1;
                } else {
                    accumulator.series[currentValue.series_title]++;
                }
                return accumulator;
            }, {series: {}});
            const params = [];
            for (const series in reduced.series) {
                params.push({'label': series, 'id': series, 'count': reduced[series]});
            }
            setSeries(params);
        }).catch((error) => {
            console.error('get series', error);
        });
    };

    const handleClose = () => {
        dispatch(flipEditingStoryState());
    };

    const toggleSeries = () => {
        setIsInASeries(!isInASeries);
    };

    useEffect(() => {
        if (isLoggedIn && isEditingStory) {
            getSeries();
        }
        setIsInASeries(editables.series);
    }, [isLoggedIn, isEditingStory, editables.series]);
    
    const handleSubmit = () => {
    }

    return (
        <div>
          <Dialog open={isEditingStory} onClose={handleClose}>
            <DialogTitle>Edit</DialogTitle>
            <DialogContent>
              <Box
                component="form"
                sx={{
                  '& .MuiTextField-root': {m: 1, width: 300},
                }}>
                <div>
                  <TextField
                    onChange={(event) => {
                      formInput['title'] = event.target.value;
                      setFormInput(formInput);
                    }}
                    autoFocus
                    label="Title"
                    value={editables.title}
                    helperText="Cannot be blank"
                  />
                </div>
                <div>
                  <TextField
                    onChange={(event) => {
                      formInput['description'] = event.target.value;
                      setFormInput(formInput);
                    }}
                    label="Description"
                    helperText="Cannot be blank"
                    value={editables.description}
                    multiline
                    maxRows={4}
                  />
                </div>
                <div>
                  <FormControlLabel label="This is part of a series" control={
                    <Checkbox defaultChecked={editables.series} id="isSeries" label="" onChange={toggleSeries} />
                  } sx={{
                    '& .MuiFormControlLabel-label': {color: 'rgba(0, 0, 0, 0.6)'},
                  }}
                  />
                </div>
                {
                isInASeries ?
                  <div>
                    <Autocomplete
                      onInputChange={(event) => {
                        if (event) {
                            formInput['series'] = event.target.value;
                            setFormInput(formInput);
                        }
                      }}
                      onChange={(event, actions) => {
                        if (event && actions) {
                            formInput['series'] = actions.id;
                            setFormInput(formInput);
                        }
                      }}
                      freeSolo
                      options={series}
                      value={editables.seriesTitle}
                      renderInput={(params) => <TextField {...params} label="Series" />}
                    />
                  </div> :
                ''
                }
                {
                areErrors ?
                  <div id="error_report" className="form-error">{currentError}</div> :
                ''
                }
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit}>Create</Button>
            </DialogActions>
          </Dialog>
        </div>
      );
}

export default EditStory;