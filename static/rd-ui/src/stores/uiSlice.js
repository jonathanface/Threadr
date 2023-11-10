import { createSlice } from '@reduxjs/toolkit';

export const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        isChapterMenuOpen: false,
        subscriptionFormOpen: false,
        refreshStoryList: false,
        isLoaderVisible: false
    },
    reducers: {
      flipChapterMenuOpen: (state) => {
        state.isChapterMenuOpen = !state.isChapterMenuOpen;
      },
      setSubscriptionFormOpen: (state, action) => {
        state.subscriptionFormOpen = action.payload;
      },
      flipRefreshStoryList: (state) => {
        state.refreshStoryList = !state.refreshStoryList;
      },
      setIsLoaderVisible: (state, action) => {
        state.isLoaderVisible = action.payload;
      }
    }
  });
  
  export const {flipChapterMenuOpen, setSubscriptionFormOpen, flipRefreshStoryList, setIsLoaderVisible} = uiSlice.actions;
  
  export default uiSlice.reducer;