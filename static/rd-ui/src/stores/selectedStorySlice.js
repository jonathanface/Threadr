import {createSlice} from '@reduxjs/toolkit';

export const selectedStorySlice = createSlice({
  name: 'selectedStoryTitle',
  initialState: {
    value: null
  },
  reducers: {
    setSelectedStoryTitle: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setSelectedStoryTitle} = selectedStorySlice.actions;

export default selectedStorySlice.reducer;
