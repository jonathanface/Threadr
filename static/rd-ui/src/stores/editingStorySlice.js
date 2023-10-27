import { createSlice } from '@reduxjs/toolkit';

export const editingStorySlice = createSlice({
  name: 'isEditingStory',
  initialState: {
    isOpen: false,
    editables: {}
  },
  reducers: {
    flipEditingStoryState: (state) => {
      state.isOpen = !state.isOpen;
    },
    setStoryEditables: (state, action) => {
      state.editables = action.payload;
    }
  }
});

export const {flipEditingStoryState, setStoryEditables} = editingStorySlice.actions;

export default editingStorySlice.reducer;
