import { configureStore } from '@reduxjs/toolkit'
import loggedInSlice from './loggedInSlice'

export default configureStore({
  reducer: {
    isLoggedIn: loggedInSlice
  },
})