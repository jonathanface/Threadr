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
import { flipCreatingNewStory, setSelectedStory } from '../../stores/storiesSlice';
import PortraitDropper from '../portraitdropper/PortraitDropper';

const CreateNewStory = () => {
  const [isInASeries, setIsInASeries] = useState(false);
  const [series, setSeries] = useState([]);
  const isCreatingNewStory = useSelector((state) => state.stories.isCreatingNew);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);

  const dispatch = useDispatch();
  const initMap = new Map();
  initMap['place'] = 1;
  const [formInput, setFormInput] = useState(initMap);
  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [imageURL, setImageURL] = useState();
  const defaultImageURL = 'img/icons/story_standalone_icon.jpg';

  const resetForm = () => {
    setFormInput(initMap);
    setAreErrors(false);
    setCurrentError('');
    setIsInASeries(false);
  };

  const handleClose = () => {
    resetForm();
    dispatch(flipCreatingNewStory());
  };

  const toggleSeries = () => {
    setIsInASeries(!isInASeries);
  };

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

  const getDefaultImage = () => {
    const randomImageURL = 'https://picsum.photos/300';
    fetch(randomImageURL).then((response) => {
      if (response.ok) {
        setImageURL(response.url);
      } else {
        setImageURL(defaultImageURL);
      }
      updateFormImage();
    }).catch((error) => {
      console.error(error);
    });
  };

  const getBlobExtension = (mimeType) => {
    console.log('ext for', mimeType);
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/gif':
        return '.gif';
      default:
        return '';
    }
  };

  const updateFormImage = async () => {
    fetch(imageURL, {
      headers: {
        'Accept': 'image/*'
      },
    }).then((response) => response.blob()).then((blob) => {
      const fd = new FormData();
      fd.append('file', blob, 'temp'+getBlobExtension(blob.type));
      setFormInput((prevFormInput) => ({
        ...prevFormInput, // spread previous form input
        image: fd, // set new image data
      }));
    }).catch((error) => {
      console.error('Fetch operation failed: ', error);
    });
  };

  useEffect(() => {
    if (imageURL) {
      updateFormImage();
    }
  }, [imageURL]);

  useEffect(() => {
    if (isLoggedIn && isCreatingNewStory) {
      getSeries();
      getDefaultImage();
      setIsInASeries(false);
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

    if (formInput['series_id']) {
      formInput['place'] = series.length;
    }
    setCurrentError('');
    setAreErrors(false);

    const formData = formInput.image;
    for (const key in formInput) {
      if (key !== 'image' && formInput.hasOwnProperty(key)) {
        formData.append(key, formInput[key]);
      }
    }

    fetch('/api/stories', {
      method: 'POST',
      body: formData
    }).then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        if (response.status === 401) {
          dispatch(setAlertMessage('inadequate subscription'));
          dispatch(setAlertSeverity('error'));
          dispatch(setAlertOpen(true));
          handleClose();
          return;
        }
        if (response.status === 409) {
          setCurrentError('A story by that name already exists. All stories must be uniquely titled.');
          setAreErrors(true);
          return;
        }
        setCurrentError('Unable to create a story at this time. Please try again later.');
        setAreErrors(true);
      }
    }).then((json) => {
      const storyID = json.story_id;
      dispatch(setSelectedStory(storyID));
      const history = window.history;
      history.pushState({storyID}, 'created new story', '/story/' + encodeURIComponent(storyID) + '?chapter=1');
      setTimeout(() => {
        handleClose();
      }, 1000);
    });
  };

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
      <Dialog open={isCreatingNewStory} onClose={handleClose}>
        <DialogTitle>Create a Story</DialogTitle>
        <DialogContent>
          <Box component="form">
            <div>
              <h3>Image for Your Story</h3>
              <PortraitDropper imageURL={imageURL} name="New Story" onComplete={processImage}/>
              <TextField
                onChange={(event) => {
                  setFormInput((prevFormInput) => ({
                    ...prevFormInput,
                    title: event.target.value
                  }));
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
                  onInputChange={(event) => {
                    if (event) {
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: event.target.value
                      }));
                    }
                  }}
                  onChange={(event, actions) => {
                    if (event) {
                      setFormInput((prevFormInput) => ({
                        ...prevFormInput,
                        series_id: actions.id
                      }));
                    }
                  }}
                  freeSolo
                  options={series}
                  renderInput={(params) => <TextField {...params} label="Series" />}
                />
              </div> :
            ''
            }
            {areErrors && <div id="error_report" className="form-error">{currentError}</div>}
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
