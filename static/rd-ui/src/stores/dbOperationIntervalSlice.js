import {createSlice} from '@reduxjs/toolkit';

export const dbOperationIntervalSlice = createSlice({
  name: 'dbOperationInterval',
  initialState: {
    value: null
  },
  reducers: {
    setDBOperationInterval: (state, action) => {
      state.value = action.payload;
    },
    clearDBOperationInterval: (state) => {
      clearInterval(state.value);
      state.value = null;
    }
  }
});

export const {setDBOperationInterval, clearDBOperationInterval} = dbOperationIntervalSlice.actions;

export default dbOperationIntervalSlice.reducer;
