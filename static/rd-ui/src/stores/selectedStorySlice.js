import {createSlice} from '@reduxjs/toolkit';

export const selectedStorySlice = createSlice({
  name: 'selectedStory',
  initialState: {
    value: null
  },
  reducers: {
    setSelectedStory: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setSelectedStory} = selectedStorySlice.actions;

export default selectedStorySlice.reducer;
