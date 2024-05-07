import { createSlice } from "@reduxjs/toolkit";
import { Story } from "../types";

interface StoriesPanel {
  isCreatingNew: boolean;
  isEditingStory: boolean;
  belongsToSeries: string;
  standaloneList: Story[];
  selectedStory: Story | undefined;
  storyBeingEdited: Story | undefined;
}

const initialState: StoriesPanel = {
  isCreatingNew: false,
  isEditingStory: false,
  belongsToSeries: "",
  standaloneList: [],
  selectedStory: undefined,
  storyBeingEdited: undefined,
};

export const storiesSlice = createSlice({
  name: "stories",
  initialState,
  reducers: {
    flipCreatingNewStory: (state, action) => {
      state.belongsToSeries = action.payload;
      if (action.payload) {
        state.isCreatingNew = true;
        return;
      }
      state.isCreatingNew = !state.isCreatingNew;
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
    setSelectedStory: (state, action) => {
      state.selectedStory = action.payload;
    },
    pushToStandaloneList: (state, action) => {
      state.standaloneList.push(action.payload);
    },
    setStoryBeingEdited: (state, action) => {
      state.storyBeingEdited = action.payload;
    },
    setStoryBelongsToSeries: (state, action) => {
      state.belongsToSeries = action.payload;
    },
  },
});

export const {
  flipCreatingNewStory,
  flipEditingStory,
  setStandaloneList,
  setSelectedStory,
  pushToStandaloneList,
  setStoryBeingEdited,
  setStoryBelongsToSeries,
} = storiesSlice.actions;

export default storiesSlice.reducer;
