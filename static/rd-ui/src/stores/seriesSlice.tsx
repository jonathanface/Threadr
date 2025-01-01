import { Action, createSlice } from "@reduxjs/toolkit";
import { SeriesPanel } from "../types/Series";

const initialState: SeriesPanel = {
  isEditingSeries: false,
  seriesList: [],
  seriesBeingEdited: {
    series_id: "",
    series_description: "",
    series_title: "",
    stories: [],
    created_at: 0,
    image_url: "",
  },
};

interface IAction<T> extends Action<string> {
  type: string;
  payload?: T;
  error?: boolean;
}

export const seriesSlice = createSlice({
  name: "series",
  initialState: initialState,
  reducers: {
    flipEditingSeries: (state, action: IAction<boolean>) => {
      if (action?.payload) {
        state.isEditingSeries = action.payload;
        return;
      }
      state.isEditingSeries = !state.isEditingSeries;
    },
    setSeriesBeingEdited: (state, action) => {
      state.seriesBeingEdited = action.payload;
    },
    setSeriesList: (state, action) => {
      state.seriesList = action.payload;
    },
    pushToSeriesList: (state, action) => {
      state.seriesList.push(action.payload);
    },
  },
});

export const {
  flipEditingSeries,
  setSeriesBeingEdited,
  setSeriesList,
  pushToSeriesList,
} = seriesSlice.actions;

export default seriesSlice.reducer;
