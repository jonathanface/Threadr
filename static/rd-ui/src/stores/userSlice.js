import { createSlice } from "@reduxjs/toolkit";

export const userSlice = createSlice({
  name: "user",
  initialState: {
    isLoggedIn: false,
    userDetails: {},
    configPanelVisible: false,
    loginPanelVisible: false,
  },
  reducers: {
    flipLoggedInState: (state) => {
      state.isLoggedIn = !state.isLoggedIn;
    },
    setUserDetails: (state, action) => {
      state.userDetails = action.payload;
    },
    flipConfigPanelVisible: (state) => {
      state.configPanelVisible = !state.configPanelVisible;
    },
    flipLoginPanelVisible: (state) => {
      state.loginPanelVisible = !state.loginPanelVisible;
    },
  },
});

export const { flipLoggedInState, setUserDetails, flipConfigPanelVisible, flipLoginPanelVisible } = userSlice.actions;

export default userSlice.reducer;
