import React, {useEffect} from 'react';
import {useSelector, useDispatch} from 'react-redux';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import {flipLoggedInState} from './stores/loggedInSlice';
import {setCurrentStoryID} from './stores/currentStorySlice';
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal';
import './css/main.css';
import { setCurrentStoryChapter } from './stores/currentStoryChapterSlice';


const Threadr = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const currentStoryID = useSelector((state) => state.currentStoryID.value);
  const dispatch = useDispatch();

  useEffect(() => {
    fetch('/api/user')
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Fetch problem userData ' + response.status);
        }).then((data) => dispatch(flipLoggedInState()))
        .catch((e) => {
          console.error('ERROR', e);
        });
    const location = window.location.pathname;
    const splitDirectories = location.split('/');
    var urlParams = new URLSearchParams(window.location.search);
    if (splitDirectories[1] === 'story' && splitDirectories[2].trim() !== '') {
      dispatch(setCurrentStoryID(decodeURIComponent(splitDirectories[2])));
    }
    if (urlParams.get('chapter') !== '') {
      dispatch(setCurrentStoryChapter(parseInt(urlParams.get('chapter'))));
    }
  }, [dispatch]);

  return (
    <div className="App">
      <Sidebar />
      <main>
        {
          isLoggedIn && currentStoryID ? <Document storyID={currentStoryID}/> : ''
        }
        <CreateNewStory />
      </main>
    </div>
  );
};

export default Threadr;
