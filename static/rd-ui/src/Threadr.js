import React, {useState, useEffect} from 'react';
import { useSelector, useDispatch } from 'react-redux'
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import { flipLoggedInState } from './stores/loggedInSlice'
import './css/main.css';


const Threadr = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value)
  const currentStoryID = useSelector((state) => state.currentStoryID.value)
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

  return (
    <div className="App">
      <Sidebar />
      <main>
        {
          isLoggedIn ? <Document storyID={currentStoryID}/> : ""
        }
      </main>
    </div>
  );
}

export default Threadr;
