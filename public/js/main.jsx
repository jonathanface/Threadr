import React from 'react';
import ReactDOM from 'react-dom';
import {ErrorBoundary} from './ErrorBoundary.jsx';
import {Landing} from './Landing.jsx';


window.onload = function() {
  ReactDOM.render(
      <ErrorBoundary>
        <Landing />
      </ErrorBoundary>,
      document.getElementById('root')
  );
};

