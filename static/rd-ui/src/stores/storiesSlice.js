import { createSlice } from '@reduxjs/toolkit';

export const storiesSlice = createSlice({
  name: 'stories',
  initialState: {
    isCreatingNew: false,
    isEditing: false,
    seriesToAppend: "",
    standaloneList: [],
    seriesList:new Map(),
    editables: {}
  },
  reducers: {
    flipCreatingNewStory: (state, action) => {
      state.isCreatingNew = !state.isCreatingNew;
      if (action.payload) {
        state.seriesToAppend = action.payload;
      }
    },
    flipEditingStory: (state) => {
      state.isEditing = !state.isEditing;
    },
    setStandaloneList: (state, action) => {
      state.standaloneList = action.payload;
    },
    setSeriesList: (state, action) => {
      state.seriesList = action.payload;
    },
    setStoryEditables: (state, action) => {
      state.editables = action.payload;
    }
  }
});

export const {flipCreatingNewStory, flipEditingStory, setStandaloneList, setSeriesList, setStoryEditables} = storiesSlice.actions;

export default storiesSlice.reducer;
