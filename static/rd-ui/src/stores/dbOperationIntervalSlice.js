import { createSlice } from '@reduxjs/toolkit'

export const dbOperationIntervalSlice = createSlice({
    name:'dbOperationInterval',
    initialState: {
      value: null
    },
    reducers: {
      setDBOperationInterval: (state, action) => {
        state.value = action.payload
      }
    }
})

export const { setDBOperationInterval } = dbOperationIntervalSlice.actions

export default dbOperationIntervalSlice.reducer
