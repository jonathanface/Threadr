import { createSlice } from "@reduxjs/toolkit";

export const storiesSlice = createSlice({
  name: "stories",
  initialState: {
    isCreatingNew: false,
    isEditingStory: false,
    belongsToSeries: "",
    standaloneList: [],
    editables: {},
    selectedStory: {
      title: "",
      id: "",
    },
  },
  reducers: {
    flipCreatingNewStory: (state, action) => {
      state.isCreatingNew = !state.isCreatingNew;
      state.belongsToSeries = action.payload;
    },
    flipEditingStory: (state, action) => {
      state.isEditingStory = !state.isEditingStory;
      if (action.payload) {
        state.belongsToSeries = action.payload;
      }
    },
    setStandaloneList: (state, action) => {
      state.standaloneList = action.payload;
    },
    setStoryEditables: (state, action) => {
      state.editables = action.payload;
    },
    setSelectedStory: (state, action) => {
      state.selectedStory = action.payload;
    },
  },
});

export const { flipCreatingNewStory, flipEditingStory, setStandaloneList, setStoryEditables, setSelectedStory } =
  storiesSlice.actions;

export default storiesSlice.reducer;
