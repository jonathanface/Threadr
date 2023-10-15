import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import {useSelector, useDispatch} from 'react-redux';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import {setAlertMessage, setAlertOpen, setAlertTitle, setAlertSeverity, setAlertTimeout} from '../stores/alertSlice';

const Toaster = () => {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.alerts.open);
  const severity = useSelector((state) => state.alerts.severity);
  const alertMessage = useSelector((state) => state.alerts.message);
  const title = useSelector((state) => state.alerts.title);
  const timeout = useSelector((state) => state.alerts.timeout);

  const handleClose = () => {
    dispatch(setAlertMessage(''));
    dispatch(setAlertSeverity('info'));
    dispatch(setAlertTitle("Announcement"));
    dispatch(setAlertOpen(false));
    dispatch(setAlertTimeout(6000));
  };

  return (
    <Snackbar
      className="alert-toast"
      autoHideDuration={timeout}
      anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
      open={open}
      onClose={handleClose}
      key='bottom_right'>
      <Alert severity={severity}>
        <AlertTitle>{title}</AlertTitle>
        <div dangerouslySetInnerHTML={{ __html: alertMessage}}/>
      </Alert>
    </Snackbar>
  );
};
export default Toaster;
