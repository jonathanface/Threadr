import {configureStore} from '@reduxjs/toolkit';
import loggedInSlice from './loggedInSlice';
import currentStorySlice from './currentStorySlice';
import creatingNewStorySlice from './creatingNewStorySlice';
import refreshStoryListSlice from './refreshStoryListSlice';
import menuOpenSlice from './toggleMenuOpenSlice';
import currentStoryChapterNumberSlice from './currentStoryChapterNumberSlice';
import currentStoryChapterTitleSlice from './currentStoryChapterTitleSlice';

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    currentStoryID: currentStorySlice,
    currentStoryChapterNumber: currentStoryChapterNumberSlice,
    currentStoryChapterTitle: currentStoryChapterTitleSlice,
    isCreatingNewStory: creatingNewStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice,
  },
});
