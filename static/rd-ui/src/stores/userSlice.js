import { createSlice } from '@reduxjs/toolkit';

export const userSlice = createSlice({
    name: 'user',
    initialState: {
        isLoggedIn: false,
    },
    reducers: {
        flipLoggedInState: (state) => {
            state.isLoggedIn = !state.isLoggedIn;
        }
    }
  });
  
  export const {flipLoggedInState} = userSlice.actions;
  
  export default userSlice.reducer;