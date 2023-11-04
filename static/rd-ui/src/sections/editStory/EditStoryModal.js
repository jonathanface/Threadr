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
import { flipEditingStory, setSeriesList, setStandaloneList } from '../../stores/storiesSlice';
import PortraitDropper from '../portraitdropper/PortraitDropper';

const EditStory = () => {
    
    const [series, setSeries] = useState([]);
    const isEditingStory = useSelector((state) => state.stories.isEditing);
    const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
    const belongsToSeries = useSelector((state) => state.stories.belongsToSeries);
    const dispatch = useDispatch();

    const initMap = new Map();
    const [formInput, setFormInput] = React.useState(initMap);
    const [areErrors, setAreErrors] = React.useState(false);
    const [currentError, setCurrentError] = React.useState('');

    const editables = useSelector((state) => state.stories.editables);
    const [isInASeries, setIsInASeries] = useState(editables.series);
    const [currentSeries, setCurrentSeries] = useState(belongsToSeries);
    const seriesList = useSelector((state) => state.stories.seriesList);
    const standaloneList = useSelector((state) => state.stories.standaloneList);

    const resetForm = () => {
      setFormInput(initMap);
      setAreErrors(false);
      setCurrentError("");
      setIsInASeries(false);
    }

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
        resetForm();
        dispatch(flipEditingStory());
    };

    const toggleSeries = () => {
        setIsInASeries(!isInASeries);
    };

    useEffect(() => {
        if (isLoggedIn && isEditingStory) {
            getSeries();
        }
        setIsInASeries(editables.series);
    }, [isLoggedIn, isEditingStory, editables.series, editables]);

    useEffect(() => {
      setFormInput(prevFormInput => ({
        ...prevFormInput,
        description: editables.description,
        title: editables.title,
        series_id: editables.series_id
      }));
    }, [editables.description, editables.title, editables.series])
    
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
      if (!isInASeries && formInput['series_id']) {
        formInput.delete('series_id');
      }
      if (formInput['series_id']) {
        formInput['place'] = series.stories.length;
      }
      const formData = formInput.image ? formInput.image : new FormData();
      for (const key in formInput) {
        if (key !== 'image' && formInput.hasOwnProperty(key)) {
          formData.append(key, formInput[key]);
        }
      }
      setCurrentError('');
      setAreErrors(false);
      fetch('/api/stories/' + editables.id + '/details', {
        method: 'PUT',
        body: formData
      }).then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error(response);
        }
      }).then((json) => {
        // todo switching story from series to standalone
        if (formInput.series_id) {
          const newList = seriesList.map(story => {
            if (story.id === editables.id) {
              return {
                ...story,
                title: formInput.title ? formInput.title : story.title,
                description: formInput.description ? formInput.description : story.description,
                image: formInput.image ? json.image_url : story.image
              }
            };
            return story;
          });
          dispatch(setSeriesList(newList));
        } else {
          const newList = standaloneList.map(story => {
            if (story.id === editables.id) {
              return {
                ...story,
                ...(formInput.title && { title: formInput.title }),
                ...(formInput.description && { description: formInput.description }),
                ...(formInput.image && { image: json.image_url }),
                ...(formInput.series_id && { series_id: formInput.series_id }),
              };
            };
            return story;
          });
          dispatch(setStandaloneList(newList));
        }
        setTimeout(()=> {
          handleClose();
        }, 1000);
      }).catch((error) => {
        if (error.status === 401) {
          dispatch(setAlertMessage('inadequate subscription'));
          dispatch(setAlertSeverity('error'));
          dispatch(setAlertOpen(true));
          handleClose();
          return;
        }
        if (error.status === 409) {
          setCurrentError("A story by that name already exists. All stories must be uniquely titled.");
          setAreErrors(true);
          return;
        }
        setCurrentError("Unable to create a story at this time. Please try again later.");
        setAreErrors(true);
      });
    }


    const storyTitle = editables.title ? editables.title : "Unknown Story";

    const getBlobExtension = (mimeType) => {
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
                <h3>Image for {storyTitle}</h3>
                <PortraitDropper imageURL={editables.image} name={storyTitle} onComplete={processImage}/>
                <div>
                  <TextField
                    onChange={(event) => {
                      setFormInput(prevFormInput => ({
                        ...prevFormInput,
                        title: event.target.value
                      }));
                    }}
                    autoFocus
                    label="Title"
                    defaultValue={editables.title}
                    helperText="Cannot be blank"
                  />
                </div>
                <div>
                  <TextField
                    onChange={(event) => {
                      setFormInput(prevFormInput => ({
                        ...prevFormInput,
                        description: event.target.value
                      }));
                    }}
                    label="Description"
                    helperText="Cannot be blank"
                    defaultValue={editables.description}
                    multiline
                    maxRows={4}
                  />
                </div>
                <div>
                  <FormControlLabel label="This is part of a series" control={
                    <Checkbox defaultChecked={editables.series_id} id="isSeries" label="" onChange={toggleSeries} />
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
                          setFormInput(prevFormInput => ({
                            ...prevFormInput,
                            series_id: event.target.value
                          }));
                        }
                      }}
                      onChange={(event, actions) => {
                        if (event && actions) {
                          setFormInput(prevFormInput => ({
                            ...prevFormInput,
                            series_id: actions.id
                          }));
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
              <Button onClick={handleSubmit}>Update</Button>
            </DialogActions>
          </Dialog>
        </div>
      );
}

export default EditStory;