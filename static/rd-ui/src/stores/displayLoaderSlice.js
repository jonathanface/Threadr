import {createSlice} from '@reduxjs/toolkit';

export const displayLoaderSlice = createSlice({
  name: 'loaderVisible',
  initialState: {
    value: false
  },
  reducers: {
    setLoaderVisible: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setLoaderVisible} = displayLoaderSlice.actions;

export default displayLoaderSlice.reducer;
