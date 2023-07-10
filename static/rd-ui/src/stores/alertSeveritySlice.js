import {createSlice} from '@reduxjs/toolkit';

export const alertSeveritySlice = createSlice({
  name: 'alertSeverity',
  initialState: {
    value: 'info'
  },
  reducers: {
    setAlertSeverity: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setAlertSeverity} = alertSeveritySlice.actions;

export default alertSeveritySlice.reducer;
