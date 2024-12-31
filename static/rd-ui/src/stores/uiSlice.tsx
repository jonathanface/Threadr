import { createSlice } from "@reduxjs/toolkit";

export interface UIStates {
  isChapterMenuOpen: boolean;
  isSubscriptionFormOpen: boolean;
  triggerStoryListRefresh: boolean;
  isLoaderVisible: boolean;
}

const initialState: UIStates = {
  isChapterMenuOpen: false,
  isSubscriptionFormOpen: false,
  triggerStoryListRefresh: false,
  isLoaderVisible: false,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialState,
  reducers: {
    flipChapterMenuOpen: (state) => {
      state.isChapterMenuOpen = !state.isChapterMenuOpen;
    },
    setIsSubscriptionFormOpen: (state, action) => {
      state.isSubscriptionFormOpen = action.payload;
    },
    triggerStoryListRefresh: (state) => {
      state.triggerStoryListRefresh = !state.triggerStoryListRefresh;
    },
    setIsLoaderVisible: (state, action) => {
      state.isLoaderVisible = action.payload;
    },
  },
});

export const {
  flipChapterMenuOpen,
  setIsSubscriptionFormOpen,
  triggerStoryListRefresh,
  setIsLoaderVisible,
} = uiSlice.actions;

export default uiSlice.reducer;
