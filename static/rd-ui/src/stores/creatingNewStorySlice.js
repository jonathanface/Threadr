import { createSlice } from '@reduxjs/toolkit'

export const creatingNewStorySlice = createSlice({
    name:'isCreatingNewStory',
    initialState: {
      value: false
    },
    reducers: {
      flipCreatingNewStoryState: (state) => {
        state.value = !state.value
      }
    }
})

export const { flipCreatingNewStoryState } = creatingNewStorySlice.actions

export default creatingNewStorySlice.reducer