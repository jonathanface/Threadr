import { createSlice } from '@reduxjs/toolkit';

export const creatingNewStorySlice = createSlice({
  name: 'isCreatingNewStory',
  initialState: {
    isOpen: false,
    seriesToAppend: ""
  },
  reducers: {
    flipCreatingNewStoryState: (state, action) => {
      state.isOpen = !state.isOpen;
      if (action.payload) {
        state.seriesToAppend = action.payload;
      }
    }
  }
});

export const {flipCreatingNewStoryState} = creatingNewStorySlice.actions;

export default creatingNewStorySlice.reducer;
