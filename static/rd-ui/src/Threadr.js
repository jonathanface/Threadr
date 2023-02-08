import React, {useState, useEffect} from 'react';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import './css/main.css';


const Threadr = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => { 
    fetch(process.env.REACT_APP_SERVER_URL + '/api/user')
    .then((response) => { 
      if (response.ok) { 
        return response.json(); 
      } 
      throw new Error('Fetch problem userData ' + response.status);
    }).then(data => setIsLoggedIn(true))
    .catch((e) => {
      console.error("ERROR", e); 
    })
  }, []);

  const [currentStoryID, setCurrentStoryID] = useState();
  const setCurrentDocumentID = (storyID) => {
    setCurrentStoryID(storyID);
  }

  const signout = () => {
    fetch(process.env.REACT_APP_SERVER_URL + '/auth/logout', {
        method: "DELETE"
    })
    .then((response) => {
        if (response.ok) {
            setIsLoggedIn(false);
            return;
        }
        throw new Error('Fetch problem logout ' + response.status);
    }).catch(error => {
        console.error(error);
    })
}

  return (
    <div className="App">
      <Sidebar loggedIn={isLoggedIn} signoutFunc={signout} setDocFunc={setCurrentDocumentID}/>
      <main>
        {
          isLoggedIn ? <Document storyID={currentStoryID}/> : ""
        }
      </main>
    </div>
  );
}

export default Threadr;
