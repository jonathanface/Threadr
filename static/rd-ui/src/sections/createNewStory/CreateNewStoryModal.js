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
import { setAlertMessage, setAlertOpen, setAlertSeverity } from '../../stores/alertSlice';
import { flipCreatingNewStoryState } from '../../stores/creatingNewStorySlice';
import { setSelectedStoryTitle } from '../../stores/selectedStorySlice';

const CreateNewStory = () => {
  const [isInASeries, setIsInASeries] = useState(false);
  const [series, setSeries] = useState([]);
  const isCreatingNewStory = useSelector((state) => state.isCreatingNewStory.isOpen);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const isAssignedSeries = useSelector((state) => state.isCreatingNewStory.seriesToAppend);
  
  const dispatch = useDispatch();
  const initMap = new Map();
  initMap['place'] = 1;
  const [formInput, setFormInput] = React.useState(initMap);
  const [areErrors, setAreErrors] = React.useState(false);
  const [currentError, setCurrentError] = React.useState('');

  const handleClose = () => {
    dispatch(flipCreatingNewStoryState());
  };

  const toggleSeries = () => {
    setIsInASeries(!isInASeries);
  };

  const getSeries = () => {
    fetch('/api/series')
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Fetch problem series ' + response.status);
        })
        .then((data) => {
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
  
  useEffect(() => {
    if (isLoggedIn && isCreatingNewStory) {
      getSeries();
    }
    setIsInASeries(isAssignedSeries.length ? true : false);
  }, [isLoggedIn, isCreatingNewStory, isAssignedSeries]);

  const handleSubmit = () => {
    if (!formInput['title'] || !formInput['title'].trim().length) {
      setCurrentError('Title cannot be blank');
      setAreErrors(true);
      return;
    }
    if (!formInput['description'] || !formInput['description'].trim().length) {
      setCurrentError('Description cannot be blank');
      setAreErrors(true);
      return;
    }
    if (formInput['series'] && formInput['place'] < 1) {
      setCurrentError('Place must be > 1 when assigning to a series');
      setAreErrors(true);
      return;
    }
    setCurrentError('');
    setAreErrors(false);
    fetch('/api/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formInput)
    }).then((response) => {
      if (response.ok) {
        const newStoryTitle = formInput['title'];
        dispatch(setSelectedStoryTitle(newStoryTitle));
        const history = window.history;
        history.pushState({newStoryTitle}, 'created new story', '/story/' + encodeURIComponent(newStoryTitle) + '?chapter=1');
        setTimeout(() => {
          setIsInASeries(false);
          dispatch(flipCreatingNewStoryState());
        }, 1000);
      } else {
        console.log("resp", response);
        if (response.status === 401) {
          dispatch(setAlertMessage('inadequate subscription'));
          dispatch(setAlertSeverity('error'));
          dispatch(setAlertOpen(true));
          handleClose();
          return;
        }
        if (response.status === 409) {
          setCurrentError("A story by that name already exists. All stories must be uniquely titled.");
          setAreErrors(true);
          return;
        }
        setCurrentError("Unable to create a story at this time. Please try again later.");
        setAreErrors(true);
      }
    });
  };

  return (
    <div>
      <Dialog open={isCreatingNewStory} onClose={handleClose}>
        <DialogTitle>Create a Story</DialogTitle>
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
                multiline
                maxRows={4}
              />
            </div>
            <div>
              <FormControlLabel label="This is part of a series" control={
                <Checkbox checked={isInASeries} id="isSeries" label="" onChange={toggleSeries} />
              } sx={{
                '& .MuiFormControlLabel-label': {color: 'rgba(0, 0, 0, 0.6)'},
              }}
              />
            </div>
            {
            isInASeries ?
              <div>
                <Autocomplete
                  value={isAssignedSeries}
                  onInputChange={(event) => {
                    if (event) {
                      formInput['series'] = event.target.value;
                      setFormInput(formInput);
                    }
                    
                  }}
                  onChange={(event, actions) => {
                    if (event) {
                      formInput['series'] = actions.id;
                      setFormInput(formInput);
                    }
                  }}
                  freeSolo
                  options={series}
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
};
export default CreateNewStory;
