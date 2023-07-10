import {createSlice} from '@reduxjs/toolkit';

export const alertMessageSlice = createSlice({
  name: 'alertMessage',
  initialState: {
    value: ''
  },
  reducers: {
    setAlertMessage: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setAlertMessage} = alertMessageSlice.actions;

export default alertMessageSlice.reducer;
