import React, {useEffect} from 'react';
import {useSelector, useDispatch} from 'react-redux';
import Document from './sections/document/Document';
import StoryAndSeriesListing from './sections/storyAndSeriesListing/StoryAndSeriesListing';
import {flipLoggedInState} from './stores/loggedInSlice';
import {setSelectedStoryTitle} from './stores/selectedStorySlice';
import {setSelectedSeries} from './stores/selectedSeriesSlice';
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal';
import UserMenu from './sections/UserMenu/UserMenu';
import './css/main.css';
import './css/user-menu.css';
import {setLoaderVisible} from './stores/displayLoaderSlice';
import Toaster from './utils/Toaster';
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import Subscribe from './sections/subscribe/Subscribe';

const Threadr = () => {
  const stripe = loadStripe(process.env.REACT_APP_STRIPE_KEY);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const selectedStoryTitle = useSelector((state) => state.selectedStoryTitle.value);
  const dispatch = useDispatch();

  const handleNavChange = () => {
    const location = window.location.pathname;
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
  };

  useEffect(() => {
    window.addEventListener('popstate', () => {
      handleNavChange();
    });

    fetch('/api/user').then((response) => {
      console.log("fetch user")
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem userData ' + response.status);
    }).then((data) => {
      dispatch(flipLoggedInState());
    }).catch((e) => {
      dispatch(setLoaderVisible(false));
      console.error('ERROR', e);
    });
    handleNavChange();
    return () => window.removeEventListener('popstate', handleNavChange);
  }, [dispatch]);

  const displayComponent = isLoggedIn && selectedStoryTitle ? <Document story={selectedStoryTitle}/> : <StoryAndSeriesListing/>;
  return (
    <div className="App">
      <UserMenu />
      <main>
        {displayComponent}
        <CreateNewStory />
      </main>
      <Toaster/>
      <Elements stripe={stripe}><Subscribe/></Elements>
    </div>
  );
};

export default Threadr;
