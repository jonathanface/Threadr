import { configureStore } from '@reduxjs/toolkit'
import loggedInSlice from './loggedInSlice'
import currentStorySlice from './currentStorySlice'
import creatingNewStorySlice from './creatingNewStorySlice'
import refreshStoryListSlice from './refreshStoryListSlice'
import menuOpenSlice from './toggleMenuOpenSlice'

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    currentStoryID: currentStorySlice,
    isCreatingNewStory: creatingNewStorySlice,
    refreshStoryList: refreshStoryListSlice,
    isMenuOpen: menuOpenSlice
  },
})