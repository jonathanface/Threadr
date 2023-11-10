import { createSlice } from '@reduxjs/toolkit';

export const storiesSlice = createSlice({
  name: 'stories',
  initialState: {
    isCreatingNew: false,
    isEditing: false,
    belongsToSeries: '',
    standaloneList: [],
    seriesList: [],
    editables: {},
    selectedStory: ''
  },
  reducers: {
    flipCreatingNewStory: (state, action) => {
      state.isCreatingNew = !state.isCreatingNew;
      state.belongsToSeries = action.payload;
      
    },
    flipEditingStory: (state, action) => {
      state.isEditing = !state.isEditing;
      if (action.payload) {
        state.belongsToSeries = action.payload;
      }
    },
    setStandaloneList: (state, action) => {
      state.standaloneList = action.payload;
    },
    setSeriesList: (state, action) => {
      state.seriesList = action.payload;
    },
    setStoryEditables: (state, action) => {
      state.editables = action.payload;
    },
    setSelectedStory: (state, action) => {
      state.selectedStory = action.payload;
    }
  }
});

export const {flipCreatingNewStory, flipEditingStory, setStandaloneList, setSeriesList, setStoryEditables, setSelectedStory} = storiesSlice.actions;

export default storiesSlice.reducer;
