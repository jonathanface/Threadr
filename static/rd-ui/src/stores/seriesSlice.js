import { createSlice } from '@reduxjs/toolkit';

export const seriesSlice = createSlice({
    name: 'series',
    initialState: {
        isEditingSeries: false,
        selectedSeries: null,
        seriesList: [],
        editables: {},
    },
    reducers: {
        flipEditingSeries: (state) => {
            state.isEditingSeries = !state.isEditingSeries;
        },
        setSelectedSeries: (state, action) => {
            state.selectedSeries = action.payload;
        },
        setSeriesEditables: (state, action) => {
            state.editables = action.payload;
        },
        setSeriesList: (state, action) => {
            state.seriesList = action.payload;
        },
    }
});

export const {flipEditingSeries, setSelectedSeries, setSeriesEditables, setSeriesList} = seriesSlice.actions;

export default seriesSlice.reducer;