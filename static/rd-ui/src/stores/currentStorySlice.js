import { createSlice } from '@reduxjs/toolkit'

export const currentStorySlice = createSlice({
  name:'currentStoryID',
  initialState: {
    value: null
  },
  reducers: {
    setCurrentStoryID: (state, action) => {
      state.value = action.payload
    }
  }
})

export const { setCurrentStoryID } = currentStorySlice.actions

export default currentStorySlice.reducer
