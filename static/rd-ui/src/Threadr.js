import React, {useState, useEffect} from 'react';
import { useSelector, useDispatch } from 'react-redux'
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import { flipLoggedInState } from './stores/loggedInSlice'
import { flipCreatingNewStoryState } from './stores/creatingNewStorySlice'
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal'
import './css/main.css';

const Threadr = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value)
  const currentStoryID = useSelector((state) => state.currentStoryID.value)
  const isCreatingNewStory = useSelector((state) => state.isCreatingNewStory.value)
  const dispatch = useDispatch()

  useEffect(() => { 
    fetch(process.env.REACT_APP_SERVER_URL + '/api/user')
    .then((response) => { 
      if (response.ok) { 
        return response.json(); 
      } 
      throw new Error('Fetch problem userData ' + response.status);
    }).then(data => dispatch(flipLoggedInState()))
    .catch((e) => {
      console.error("ERROR", e); 
    })
  }, []);
  console.log("rerender", isLoggedIn, currentStoryID);
  return (
    <div className="App">
      <Sidebar />
      <main>
        {
          isLoggedIn && currentStoryID ? <Document storyID={currentStoryID}/> : ""
        }
        <CreateNewStory />
      </main>
    </div>
  );
}

export default Threadr;
