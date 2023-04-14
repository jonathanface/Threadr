import {createSlice} from '@reduxjs/toolkit';

export const selectedSeriesSlice = createSlice({
  name: 'selectedSeries',
  initialState: {
    value: null
  },
  reducers: {
    setSelectedSeries: (state, action) => {
      state.value = action.payload;
    }
  }
});

export const {setSelectedSeries} = selectedSeriesSlice.actions;

export default selectedSeriesSlice.reducer;
