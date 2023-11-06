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
import { flipEditingStory, setSeriesList, setStandaloneList } from '../../stores/storiesSlice';
import PortraitDropper from '../portraitdropper/PortraitDropper';

const EditStory = () => {
  
  const isEditingStory = useSelector((state) => state.stories.isEditing);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const dispatch = useDispatch();

  const editables = useSelector((state) => state.stories.editables);
  const seriesList = useSelector((state) => state.stories.seriesList);
  const standaloneList = useSelector((state) => state.stories.standaloneList);
  
  const [belongsToSeries, setBelongsToSeries] = useState("");
  const [series, setSeries] = useState([]);
  const [isInASeries, setIsInASeries] = useState(false);
  const [formInput, setFormInput] = useState({});
  const [areErrors, setAreErrors] = useState(false);
  const [currentError, setCurrentError] = useState('');

  const resetForm = () => {
    setFormInput({});
    setAreErrors(false);
    setCurrentError('');
    setIsInASeries(false);
    setBelongsToSeries("");
  };

  const getSeries = () => {
    fetch('/api/series').then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem series ' + response.status);
    }).then((data) => {
      const reduced = data.reduce((accumulator, currentValue) => {
        if (!accumulator[currentValue.series_id]) {
          accumulator[currentValue.series_id] = {
            id: currentValue.series_id,
            title: currentValue.series_title,
            count: 0,
            selected: false
          };
          const found = currentValue.stories.some(story => story.story_id === editables.id);
          if (found) {
            accumulator[currentValue.series_id].selected = true;
          }
        }
        accumulator[currentValue.series_id].count += 1;
        return accumulator;
      }, {});
      
      const params = [];
      for (const series_id in reduced) {
        const series = reduced[series_id];
        const entry = {
          'label': series.title,
          'id': series.id,
          'count': series.count
        }
        if (series.selected) {
          setBelongsToSeries(entry)
        }
        params.push(entry);
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
      setIsInASeries(!!editables.series_id);
    }
  }, [isLoggedIn, isEditingStory, editables.series_id]);

  useEffect(() => {
    setFormInput((prevFormInput) => ({
      ...prevFormInput,
      title: editables.title,
      description: editables.description,
      ...(editables.series_id && { series_id: editables.series_id }),
    }));
  }, [editables.description, editables.title, editables.series_id]);

  const handleSubmit = () => {
    console.log("in series", isInASeries, editables.series_id);
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
    if (!isInASeries && formInput.series_id) {
      delete formInput.series_id;
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
      if (json.series_id.length) {
        const newSeriesList = seriesList.map((seriesEntry) => {
          let matched = false;
          const newSeriesListings = seriesEntry.listings.map(story => {
            if (story.id === json.story_id) {
              matched = true;
              return {
                ...story,
                title: json.title,
                description: json.description,
                image: json.image_url
              };
            }
            return story;
          });
          if (!matched) {
            newSeriesListings.push({
              id: json.story_id,
              created_at: json.created_at,
              description: json.description,
              image: json.image_url,
              title: json.title,
              place: json.place,
              series_id: json.series_id
            });
          }
          return {
            ...seriesEntry,
            listings: newSeriesListings
          };
        });
        
        const newStandaloneList = standaloneList.filter(item => item.id !== editables.id);
        dispatch(setSeriesList(newSeriesList));
        dispatch(setStandaloneList(newStandaloneList));
      } else {
        let matched = false;
        const newStandaloneList = standaloneList.map((story) => {
          if (story.id === editables.id) {
            matched = true;
            return {
              ...story,
              ...(formInput.title && {title: formInput.title}),
              ...(formInput.description && {description: formInput.description}),
              ...(formInput.image && {image: json.image_url}),
              ...(formInput.series_id && {series_id: formInput.series_id}),
            };
          }
          return story;
        });
        if (!matched) {
          newStandaloneList.push({
            id: json.story_id,
            chapter: json.chapters,
            created_at: json.created_at,
            description: json.description,
            image: json.image_url,
            title: json.title
          });
        }
        dispatch(setStandaloneList(newStandaloneList));
        const updatedSeriesList = seriesList.map(currentSeries => {
          // Filter out the item with the matching editables.id
          const newSeriesListings = currentSeries.listings.filter(item =>  item.id !== editables.id);
        
          // Return a new object for the current series with the updated listings
          return {
            ...currentSeries,
            listings: newSeriesListings
          };
        });
        dispatch(setSeriesList(updatedSeriesList));
      }
      setTimeout(()=> {
        handleClose();
      }, 1000);
    }).catch((error) => {
      console.error("err", error);
      if (error.status === 401) {
        dispatch(setAlertMessage('inadequate subscription'));
        dispatch(setAlertSeverity('error'));
        dispatch(setAlertOpen(true));
        handleClose();
        return;
      }
      setCurrentError('Unable to create a story at this time. Please try again later.');
      setAreErrors(true);
    });
  };


  const storyTitle = editables.title ? editables.title : 'Unknown Story';

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
      <Dialog open={isEditingStory} onClose={handleClose}>
        <DialogTitle>Edit</DialogTitle>
        <DialogContent>
          <Box className="form-box" component="form">
            <h3>Image for {storyTitle}</h3>
            <PortraitDropper imageURL={editables.image} name={storyTitle} onComplete={processImage}/>
            <div>
              <TextField
                onChange={(event) => {
                  setFormInput((prevFormInput) => ({
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
                  setFormInput((prevFormInput) => ({
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
                          const entered = event.target.value.toString();
                          const foundSeries = series.find(srs => srs.label.toLowerCase() === entered.toLowerCase());
                          if (foundSeries && foundSeries.id) {
                            setFormInput((prevFormInput) => ({
                              ...prevFormInput,
                              series_id: foundSeries.id
                            }));
                          }
                        }
                      }}
                      onChange={(event, actions) => {
                        if (event && actions) {
                          setFormInput((prevFormInput) => ({
                            ...prevFormInput,
                            series_id: actions.id
                          }));
                        }
                      }}
                      freeSolo
                      options={series}
                      value={belongsToSeries}
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
};

export default EditStory;
