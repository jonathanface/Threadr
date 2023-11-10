import { createSlice } from '@reduxjs/toolkit';

export const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        isChapterMenuOpen: false,
        subscriptionFormOpen: false,
        refreshStoryList: false,
        loaderVisible: false
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
      setLoaderVisible: (state, action) => {
        state.value = action.payload;
      }
    }
  });
  
  export const {flipChapterMenuOpen, setSubscriptionFormOpen, flipRefreshStoryList, setLoaderVisible} = uiSlice.actions;
  
  export default uiSlice.reducer;