import {createSlice} from '@reduxjs/toolkit';

export const alertSlice = createSlice({
  name: 'alerts',
  initialState: {
    message: '',
    open: false,
    title: 'Announcement',
    severity: 'info',
    timeout: 6000,
    link: {}
  },
  reducers: {
    setAlertMessage: (state, action) => {
      state.message = action.payload; 
    },
    setAlertTitle: (state, action) => {
      state.title = action.payload;
    },
    setAlertSeverity: (state, action) => {
      state.severity = action.payload;
    },
    setAlertOpen: (state, action) => {
      state.open = action.payload;
    },
    setAlertTimeout: (state, action) => {
      state.timeout = action.payload;
    },
    setAlertLink: (state, action) => {
      state.link = action.payload;
    }
  }
});

export const {setAlertMessage, setAlertTitle, setAlertSeverity, setAlertOpen, setAlertTimeout, setAlertLink} = alertSlice.actions;

export default alertSlice.reducer;
