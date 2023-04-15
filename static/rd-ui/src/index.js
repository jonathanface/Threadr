import React from 'react';
import ReactDOM from 'react-dom/client';
import {Provider} from 'react-redux';
import store from './stores/store';
import Threadr from './Threadr';
import { ProSidebarProvider } from 'react-pro-sidebar';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <Provider store={store}>
      <ProSidebarProvider>
        <Threadr />
      </ProSidebarProvider>
    </Provider>

);
