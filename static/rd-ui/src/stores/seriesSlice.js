import { createSlice } from "@reduxjs/toolkit";

export const seriesSlice = createSlice({
  name: "series",
  initialState: {
    isEditingSeries: false,
    seriesList: [],
    editables: {},
  },
  reducers: {
    flipEditingSeries: (state) => {
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
