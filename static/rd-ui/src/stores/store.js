import { configureStore } from '@reduxjs/toolkit';
import alertSlice from './alertSlice';
import creatingNewStorySlice from './creatingNewStorySlice';
import displayLoaderSlice from './displayLoaderSlice';
import editingStorySlice from './editingStorySlice';
import loggedInSlice from './loggedInSlice';
import refreshStoryListSlice from './refreshStoryListSlice';
import selectedSeriesSlice from './selectedSeriesSlice';
import selectedStorySlice from './selectedStorySlice';
import subscriptionSlice from './subscriptionSlice';
import menuOpenSlice from './toggleMenuOpenSlice';

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    selectedStoryTitle: selectedStorySlice,
    selectedSeries: selectedSeriesSlice,
    isCreatingNewStory: creatingNewStorySlice,
    isEditingStory: editingStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice,
    isLoaderVisible: displayLoaderSlice,
    alerts: alertSlice,
    subscription: subscriptionSlice
  },
});
