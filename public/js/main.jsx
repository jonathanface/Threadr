import React from 'react';
import ReactDOM from 'react-dom';
import {ErrorBoundary} from './ErrorBoundary.jsx';
import {Document} from './Document.jsx';

window.onload = function() {
  ReactDOM.render(
      <ErrorBoundary>
        <Document />
      </ErrorBoundary>,
      document.getElementById('root')
  );
};

