import {createSlice} from '@reduxjs/toolkit';

export const currentStoryChapterTitleSlice = createSlice({
  name: 'currentStoryChapterTitle',
  initialState: {
    value: null
  },
  reducers: {
    setCurrentStoryChapterTitle: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setCurrentStoryChapterTitle} = currentStoryChapterTitleSlice.actions;

export default currentStoryChapterTitleSlice.reducer;
