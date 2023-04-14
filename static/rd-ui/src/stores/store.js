import {configureStore} from '@reduxjs/toolkit';
import loggedInSlice from './loggedInSlice';
import selectedStorySlice from './selectedStorySlice';
import selectedSeriesSlice from './selectedSeriesSlice';
import creatingNewStorySlice from './creatingNewStorySlice';
import refreshStoryListSlice from './refreshStoryListSlice';
import menuOpenSlice from './toggleMenuOpenSlice';

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    selectedStory: selectedStorySlice,
    selectedSeries: selectedSeriesSlice,
    isCreatingNewStory: creatingNewStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice,
  },
});
