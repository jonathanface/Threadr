import { Action, createSlice } from "@reduxjs/toolkit";
import { Story } from "../types";

export interface Series {
  series_id: string;
  series_title: string;
  series_description: string;
  stories: Story[];
  created_at: number;
  image_url: string;
}

export interface SeriesEditables {
  stories: Story[];
  series_title: string;
  series_description: string;
  series_id: string;
  image_url: string;
}

export interface SeriesPanel {
  isEditingSeries: boolean;
  seriesList: Series[];
  editables: SeriesEditables;
}

const initialState: SeriesPanel = {
  isEditingSeries: false,
  seriesList: [],
  editables: {
    stories: [],
    series_title: "",
    series_description: "",
    series_id: "",
    image_url: "",
  },
};

interface IAction<T> extends Action<string> {
  type: string;
  payload?: T;
  error?: boolean;
  meta?: any;
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
    setSeriesEditables: (state, action) => {
      state.editables = action.payload;
    },
    setSeriesList: (state, action) => {
      state.seriesList = action.payload;
    },
    pushToSeriesList: (state, action) => {
      state.seriesList.push(action.payload);
    },
  },
});

export const { flipEditingSeries, setSeriesEditables, setSeriesList, pushToSeriesList } = seriesSlice.actions;

export default seriesSlice.reducer;
