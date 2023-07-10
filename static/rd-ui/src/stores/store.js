import {configureStore} from '@reduxjs/toolkit';
import loggedInSlice from './loggedInSlice';
import selectedStorySlice from './selectedStorySlice';
import selectedSeriesSlice from './selectedSeriesSlice';
import creatingNewStorySlice from './creatingNewStorySlice';
import refreshStoryListSlice from './refreshStoryListSlice';
import menuOpenSlice from './toggleMenuOpenSlice';
import displayLoaderSlice from './displayLoaderSlice';
import alertMessageSlice from './alertMessageSlice';
import alertSeveritySlice from './alertSeveritySlice';
import alertOpenSlice from './alertOpenSlice';

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    selectedStoryTitle: selectedStorySlice,
    selectedSeries: selectedSeriesSlice,
    isCreatingNewStory: creatingNewStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice,
    isLoaderVisible: displayLoaderSlice,
    alertMessage: alertMessageSlice,
    alertSeverity: alertSeveritySlice,
    isAlertOpen: alertOpenSlice
  },
});
