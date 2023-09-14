import React from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import {useSelector} from 'react-redux';

const Loader = () => {
  const isLoaderVisible = useSelector((state) => state.isLoaderVisible.value);
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
