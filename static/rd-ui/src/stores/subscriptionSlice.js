import {createSlice} from '@reduxjs/toolkit';

export const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState: {
    formOpen: false
  },
  reducers: {
    setSubscriptionFormOpen: (state, action) => {
      console.log("set form to ", action.payload);
      state.formOpen = action.payload;
    }
  }
});

export const {setSubscriptionFormOpen} = subscriptionSlice.actions;

export default subscriptionSlice.reducer;
