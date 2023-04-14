import React, {useState, useEffect} from 'react';
import {useSelector, useDispatch} from 'react-redux';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Checkbox from '@mui/material/Checkbox';
import DialogTitle from '@mui/material/DialogTitle';
import {flipCreatingNewStoryState} from '../../stores/creatingNewStorySlice';
import FormControlLabel from '@mui/material/FormControlLabel';
import Autocomplete from '@mui/material/Autocomplete';
import {flipRefreshStoryList} from '../../stores/refreshStoryListSlice';
import {setSelectedStory} from '../../stores/selectedStorySlice';


const CreateNewStory = () => {
  const [isInASeries, setIsInASeries] = useState(false);
  const [series, setSeries] = useState([]);
  const isCreatingNewStory = useSelector((state) => state.isCreatingNewStory.value);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
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
          const params = [];
          data.forEach((seriesItem) => {
            params.push({'label': seriesItem.series_title.Value, 'id': seriesItem.series_title.Value, 'count': parseInt(seriesItem.story_count.Value)});
          });
          setSeries(params);
        }).catch((error) => {
          console.error('get series', error);
        });
  };
  useEffect(() => {
    if (isLoggedIn && isCreatingNewStory) {
      getSeries();
    }
  }, [isLoggedIn, isCreatingNewStory]);

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
        series.push({'label': formInput['series'], 'id': formInput['series'], 'count': formInput['place']});
        setSeries(series);
        dispatch(setSelectedStory(formInput['title']));
        setTimeout(() => {
          dispatch(flipRefreshStoryList());
          dispatch(flipCreatingNewStoryState());
          setIsInASeries(false);
        }, 1000);
      } else {
        setCurrentError(response.error);
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
                <Checkbox id="isSeries" label="" onChange={toggleSeries} />
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
                    formInput['series'] = event.target.value;
                    formInput['place'] = 1;
                    if (series.some((s) => {
                      if (s.label === event.target.value) {
                        formInput['place'] = s.count+1;
                      }
                      return null;
                    })) {setFormInput(formInput);}
                  }}
                  onChange={(event, actions) => {
                    formInput['series'] = actions.id;
                    formInput['place'] = actions.count+1;
                    setFormInput(formInput);
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
