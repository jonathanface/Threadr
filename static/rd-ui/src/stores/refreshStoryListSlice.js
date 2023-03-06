import { createSlice } from '@reduxjs/toolkit'

export const refreshStoryListSlice = createSlice({
    name:'refreshStoryList',
    initialState: {
      value: false
    },
    reducers: {
      flipRefreshStoryList: (state) => {
        state.value = !state.value
      }
    }
})

export const { flipRefreshStoryList } = refreshStoryListSlice.actions

export default refreshStoryListSlice.reducer