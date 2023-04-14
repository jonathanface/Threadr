import React, {useEffect} from 'react';
import {useSelector, useDispatch} from 'react-redux';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import StoryAndSeriesListing from './sections/storyAndSeriesListing/StoryAndSeriesListing';
import SeriesListing from './sections/seriesListing/SeriesListing';
import {flipLoggedInState} from './stores/loggedInSlice';
import {setSelectedStory} from './stores/selectedStorySlice';
import {setSelectedSeries} from './stores/selectedSeriesSlice';
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal';
import './css/main.css';

const Threadr = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const selectedStory = useSelector((state) => state.selectedStory.value);
  const selectedSeries = useSelector((state) => state.selectedSeries.value);
  const dispatch = useDispatch();

  useEffect(() => {
    fetch('/api/user').then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem userData ' + response.status);
    }).then((data) => dispatch(flipLoggedInState())).catch((e) => {
      console.error('ERROR', e);
    });

    const location = window.location.pathname;
    const splitDirectories = location.split('/');
    if (splitDirectories[1] === 'story' && splitDirectories[2].trim() !== '') {
      dispatch(setSelectedStory(decodeURIComponent(splitDirectories[2])));
    }
    if (splitDirectories[1] === 'series' && splitDirectories[2].trim() !== '') {
      dispatch(setSelectedSeries(decodeURIComponent(splitDirectories[2])));
    }
  }, [dispatch]);

  let displayComponent = <StoryAndSeriesListing/>;
  if (isLoggedIn && selectedSeries) {
    displayComponent = <SeriesListing/>;
  }
  if (isLoggedIn && selectedStory) {
    displayComponent = <Document story={selectedStory}/>;
  }

  return (
    <div className="App">
      <Sidebar />
      <main>
        {displayComponent}
        <CreateNewStory />
      </main>
    </div>
  );
};

export default Threadr;
