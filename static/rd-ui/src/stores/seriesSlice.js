import { createSlice } from '@reduxjs/toolkit';

export const seriesSlice = createSlice({
    name: 'series',
    initialState: {
        isEditingSeries: false,
        selectedSeries: null
    },
    reducers: {
        flipEditingSeries: (state) => {
            state.isEditingSeries = !state.isEditingSeries;
        },
        setSelectedSeries: (state, action) => {
            state.selectedSeries = action.payload;
        }
    }
});

export const {flipEditingSeries, setSelectedSeries} = seriesSlice.actions;

export default seriesSlice.reducer;