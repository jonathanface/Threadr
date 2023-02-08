import { createSlice } from '@reduxjs/toolkit'

export const loggedInSlice = createSlice({
    name:'isLoggedIn',
    initialState: {
      value: false
    },
    reducers: {
      flip: (state) => {
        state.value = !state.value
      }
    }
})

export const { flip } = loggedInSlice.actions

export default loggedInSlice.reducer