
import {useState} from 'react';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import './css/main.css';



const Threadr = () => {
  const [currentStoryID, setCurrentStoryID] = useState();
  const setCurrentDocumentID = (storyID) => {
    setCurrentStoryID(storyID);
  }
  return (
    <div className="App">
      <Sidebar setDocFunc={setCurrentDocumentID}/>
      <main>
        <Document storyID={currentStoryID}/>
      </main>
    </div>
  );
}

export default Threadr;
