import {createSlice} from '@reduxjs/toolkit';

export const currentStoryChapterNumberSlice = createSlice({
  name: 'currentStoryChapterNumber',
  initialState: {
    value: null
  },
  reducers: {
    setCurrentStoryChapterNumber: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setCurrentStoryChapterNumber} = currentStoryChapterNumberSlice.actions;

export default currentStoryChapterNumberSlice.reducer;
