import {createSlice} from '@reduxjs/toolkit';

export const alertOpenSlice = createSlice({
  name: 'isAlertOpen',
  initialState: {
    value: false
  },
  reducers: {
    setAlertOpen: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setAlertOpen} = alertOpenSlice.actions;

export default alertOpenSlice.reducer;
