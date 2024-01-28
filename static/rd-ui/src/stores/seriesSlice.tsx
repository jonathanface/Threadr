import { createSlice } from "@reduxjs/toolkit";
import { Story } from "../types";

export interface Series {
  series_id: string;
  series_title: string;
  series_description: string;
  stories: Story[];
  created_at: number;
  image_url: string;
}

export interface SeriesPanel {
  isEditingSeries: boolean;
  seriesList: Series[];
  editables: {};
}

const initialState: SeriesPanel = {
  isEditingSeries: false,
  seriesList: [],
  editables: {},
};

export const seriesSlice = createSlice({
  name: "series",
  initialState: initialState,
  reducers: {
    flipEditingSeries: (state, action) => {
      if (action.payload) {
        state.isEditingSeries = action.payload;
        return;
      }
      state.isEditingSeries = !state.isEditingSeries;
    },
    setSeriesEditables: (state, action) => {
      state.editables = action.payload;
    },
    setSeriesList: (state, action) => {
      state.seriesList = action.payload;
    },
  },
});

export const { flipEditingSeries, setSeriesEditables, setSeriesList } = seriesSlice.actions;

export default seriesSlice.reducer;
