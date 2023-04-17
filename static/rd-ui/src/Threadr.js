import React, {useEffect} from 'react';
import {useSelector, useDispatch} from 'react-redux';
import Document from './sections/document/Document';
import StoryAndSeriesListing from './sections/storyAndSeriesListing/StoryAndSeriesListing';
import SeriesListing from './sections/seriesListing/SeriesListing';
import {flipLoggedInState} from './stores/loggedInSlice';
import {setSelectedStoryTitle} from './stores/selectedStorySlice';
import {setSelectedSeries} from './stores/selectedSeriesSlice';
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal';
import UserMenu from './sections/UserMenu/UserMenu';
import './css/main.css';
import './css/user-menu.css';




const Threadr = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const selectedStoryTitle = useSelector((state) => state.selectedStoryTitle.value);
  const selectedSeries = useSelector((state) => state.selectedSeries.value);
  const dispatch = useDispatch();

  const handleNavChange = () => {
    const location = window.location.pathname;
    console.log("changed", location);
    const splitDirectories = location.split('/');
    if (splitDirectories[1] === 'story' && splitDirectories[2].trim() !== '') {
      dispatch(setSelectedSeries(null));
      dispatch(setSelectedStoryTitle(decodeURIComponent(splitDirectories[2])));
    } else if (splitDirectories[1] === 'series' && splitDirectories[2].trim() !== '') {
      dispatch(setSelectedStoryTitle(null));
      dispatch(setSelectedSeries(decodeURIComponent(splitDirectories[2])));
    } else {
      dispatch(setSelectedStoryTitle(null));
      dispatch(setSelectedSeries(null));
    }
  }

  useEffect(() => {
    window.addEventListener("popstate", () => {
      handleNavChange();
    });
    fetch('/api/user').then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem userData ' + response.status);
    }).then((data) => dispatch(flipLoggedInState())).catch((e) => {
      console.error('ERROR', e);
    });
    handleNavChange();
    return () => window.removeEventListener("popstate", handleEvent);
  }, [dispatch]);

  let displayComponent = <StoryAndSeriesListing/>;
  if (isLoggedIn && selectedSeries) {
    displayComponent = <SeriesListing/>;
  }
  if (isLoggedIn && selectedStoryTitle) {
    displayComponent = <Document story={selectedStoryTitle}/>;
  }

  
  return (
    <div className="App">
      <UserMenu />
      <main>
        {displayComponent}
        <CreateNewStory />
      </main>
    </div>
  );
};

export default Threadr;
