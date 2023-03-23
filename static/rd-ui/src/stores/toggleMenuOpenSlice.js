import {createSlice} from '@reduxjs/toolkit';

export const menuOpenSlice = createSlice({
  name: 'isMenuOpen',
  initialState: {
    value: false
  },
  reducers: {
    flipMenuOpen: (state) => {
      state.value = !state.value;
    }
  }
});

export const {flipMenuOpen} = menuOpenSlice.actions;

export default menuOpenSlice.reducer;
