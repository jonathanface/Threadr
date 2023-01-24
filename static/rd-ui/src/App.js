
import {useEffect} from 'react';
import Sidebar from './sections/sidebar/Sidebar';
import Document from './sections/document/Document';
import './css/main.css';

function App() {
  
  return (
    <div className="App">
      <Sidebar/>
      <main>
        <Document/>
      </main>
    </div>
  );
}

export default App;
