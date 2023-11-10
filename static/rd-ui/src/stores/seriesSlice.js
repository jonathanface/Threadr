import { createSlice } from '@reduxjs/toolkit';

export const seriesSlice = createSlice({
    name: 'series',
    initialState: {
        isEditingSeries: false,
        selectedSeries: null,
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
        }
    }
});

export const {flipEditingSeries, setSelectedSeries, setSeriesEditables} = seriesSlice.actions;

export default seriesSlice.reducer;