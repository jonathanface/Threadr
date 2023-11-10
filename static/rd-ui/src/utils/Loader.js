import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import React from 'react';
import { useSelector } from 'react-redux';

const Loader = () => {
  const isLoaderVisible = useSelector((state) => state.ui.isLoaderVisible);
  return (
    <div style={{visibility: isLoaderVisible ? 'visible' : 'hidden'}}>
      <Box className="progress-box"/>
      <Box className="prog-anim-holder">
        <CircularProgress />
      </Box>
    </div>
  );
};
export default Loader;
