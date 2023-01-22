
import {useEffect} from 'react';
import Sidebar from './sections/sidebar';
import Document from './sections/document';
import './css/main.css';

function App() {
  
  console.log("wtf");
  
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
