import { createSlice } from "@reduxjs/toolkit";
import { AlertToast, AlertToastType } from "../types/AlertToasts";

const initialState: AlertToast = {
  message: "",
  open: false,
  title: "Announcement",
  severity: AlertToastType.info,
  timeout: 60000,
  link: undefined,
  func: undefined,
};

export const alertSlice = createSlice({
  name: "alerts",
  initialState: initialState,
  reducers: {
    setAlert: (state, action) => {
      clearAlert();
      Object.assign(state, action.payload);
    },
    clearAlert: (state) => {
      Object.assign(state, initialState);
    },
  },
});

export const { setAlert, clearAlert } = alertSlice.actions;

export default alertSlice.reducer;
