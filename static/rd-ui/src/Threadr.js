import {useState, useEffect} from 'react';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import './css/main.css';


const Threadr = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const getUserData = () => {
    fetch(process.env.REACT_APP_SERVER_URL + '/api/user')
    .then((response) => {
        if (!response.ok) {
            return Promise.reject(response)
        }
        return response.json()
    })
    .then((data) => {
        console.log("got data", data.email)
        setIsLoggedIn(true);
    }).catch(error => {
        console.error(error);
    })
  }

  useEffect(() => {
    getUserData();
  },[]);

  

  const [currentStoryID, setCurrentStoryID] = useState();
  const setCurrentDocumentID = (storyID) => {
    setCurrentStoryID(storyID);
  }

  return (
    <div className="App">
      <Sidebar loggedIn={isLoggedIn} setDocFunc={setCurrentDocumentID}/>
      <main>
        {
          isLoggedIn ? <Document storyID={currentStoryID}/> : ""
        }
      </main>
    </div>
  );
}

export default Threadr;
