import React from 'react';
import ReactDOM from 'react-dom';
import {Document} from './Document.jsx';

window.onload = function() {
  ReactDOM.render(
      <Document />,
      document.getElementById('root')
  );
};
