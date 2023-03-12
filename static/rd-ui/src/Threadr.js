import React, {useEffect} from 'react';
import { useSelector, useDispatch } from 'react-redux'
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import { flipLoggedInState } from './stores/loggedInSlice'
import { setCurrentStoryID } from './stores/currentStorySlice' 
import CreateNewStory from './sections/createNewStory/CreateNewStoryModal'
import './css/main.css';



const Threadr = () => {

  const isLoggedIn = useSelector((state) => state.isLoggedIn.value)
  const currentStoryID = useSelector((state) => state.currentStoryID.value)
  const dispatch = useDispatch()

  const checkLocation = (event) => {
    const location = window.location.pathname;
    const splitDirectories = location.split('/');
    if (splitDirectories[1] === "story" && splitDirectories[2].trim() !== "") {
      dispatch(setCurrentStoryID(decodeURIComponent(splitDirectories[2])));
    }
  }

  useEffect(() => {
    console.log("effect", process.env.REACT_APP_SERVER_URL)
    fetch(process.env.REACT_APP_SERVER_URL + '/api/user')
    .then((response) => { 
      if (response.ok) { 
        return response.json(); 
      } 
      throw new Error('Fetch problem userData ' + response.status);
    }).then(data => dispatch(flipLoggedInState()))
    .catch((e) => {
      console.error("ERROR", e); 
    });
    checkLocation();
  }, []);

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
