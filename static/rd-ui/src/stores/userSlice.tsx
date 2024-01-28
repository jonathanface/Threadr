import { createSlice } from "@reduxjs/toolkit";

export interface UserDetails {
  user_id: string;
  email: string;
  renewing: boolean;
  subscription_id: string;
}

export interface User {
  isLoggedIn: boolean;
  configPanelVisible: boolean;
  loginPanelVisible: boolean;
  userDetails: UserDetails;
}

const initialState: User = {
  isLoggedIn: false,
  configPanelVisible: false,
  loginPanelVisible: false,
  userDetails: {
    user_id: "",
    email: "",
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

export const { flipLoggedInState, setUserDetails, flipConfigPanelVisible, flipLoginPanelVisible } = userSlice.actions;

export default userSlice.reducer;
