import { createSlice } from "@reduxjs/toolkit";

export const userSlice = createSlice({
  name: "user",
  initialState: {
    isLoggedIn: false,
    userDetails: {},
  },
  reducers: {
    flipLoggedInState: (state) => {
      state.isLoggedIn = !state.isLoggedIn;
    },
    setUserDetails: (state, action) => {
      console.log("set to", action.payload);
      state.userDetails = action.payload;
    },
  },
});

export const { flipLoggedInState, setUserDetails } = userSlice.actions;

export default userSlice.reducer;
