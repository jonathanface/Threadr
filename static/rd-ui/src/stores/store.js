import { configureStore } from '@reduxjs/toolkit'
import loggedInSlice from './loggedInSlice'
import currentStorySlice from './currentStorySlice'
import creatingNewStorySlice from './creatingNewStorySlice'
import refreshStoryListSlice from './refreshStoryListSlice'
import menuOpenSlice from './toggleMenuOpenSlice'
import currentStoryChapterSlice from './currentStoryChapterSlice'

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    currentStoryID: currentStorySlice,
    currentStoryChapter: currentStoryChapterSlice,
    isCreatingNewStory: creatingNewStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice
  },
})