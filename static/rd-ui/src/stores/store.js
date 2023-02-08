import { configureStore } from '@reduxjs/toolkit'
import loggedInSlice from './loggedInSlice'
import currentStorySlice from './currentStorySlice'
export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice,
    currentStoryID: currentStorySlice
  },
})