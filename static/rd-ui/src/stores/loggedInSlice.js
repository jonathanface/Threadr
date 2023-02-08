import { createSlice } from '@reduxjs/toolkit'

export const loggedInSlice = createSlice({
    name:'isLoggedIn',
    initialState: {
      value: false
    },
    reducers: {
      flipLoggedInState: (state) => {
        state.value = !state.value
      }
    }
})

export const { flipLoggedInState } = loggedInSlice.actions

export default loggedInSlice.reducer