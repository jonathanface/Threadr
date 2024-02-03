import { configureStore } from "@reduxjs/toolkit";
import alertSlice from "./alertSlice";
import seriesSlice from "./seriesSlice";
import storiesSlice from "./storiesSlice";
import uiSlice from "./uiSlice";
import userSlice from "./userSlice";

export const store = configureStore({
  reducer: {
    stories: storiesSlice,
    ui: uiSlice,
    alerts: alertSlice,
    user: userSlice,
    series: seriesSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
