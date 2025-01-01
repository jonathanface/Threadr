import { createSlice } from "@reduxjs/toolkit";
import { User } from "../types/User";

const initialState: User = {
  isLoggedIn: false,
  configPanelVisible: false,
  loginPanelVisible: false,
  userDetails: {
    user_id: "",
    email: "",
    customer_id: "",
    renewing: false,
    subscription_id: "",
  },
};

export const userSlice = createSlice({
  name: "user",
  initialState: initialState,
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

export const {
  flipLoggedInState,
  setUserDetails,
  flipConfigPanelVisible,
  flipLoginPanelVisible,
} = userSlice.actions;

export default userSlice.reducer;
