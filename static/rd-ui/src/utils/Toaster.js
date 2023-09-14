import React, {useState, useEffect} from 'react';
import Snackbar from '@mui/material/Snackbar';
import {useSelector, useDispatch} from 'react-redux';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import {setAlertMessage} from '../stores/alertMessageSlice';
import {setAlertOpen} from '../stores/alertOpenSlice';
import {setAlertSeverity} from '../stores/alertSeveritySlice';

const Toaster = () => {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.isAlertOpen.value);
  const severity = useSelector((state) => state.alertSeverity.value);
  const alertMessage = useSelector((state) => state.alertMessage.value);
  const [title, setTitle] = useState('Info');

  const handleClose = () => {
    dispatch(setAlertMessage(''));
    dispatch(setAlertSeverity('info'));
    dispatch(setAlertOpen(false));
  };

  useEffect(() => {
    setTitle(severity[0].toUpperCase() + severity.slice(1));
  }, [severity]);

  return (
    <Snackbar
      className="alert-toast"
      autoHideDuration={6000}
      anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
      open={open}
      onClose={handleClose}
      key='bottom_right'>
      <Alert severity={severity}>
        <AlertTitle>{title}</AlertTitle>
        <div>{alertMessage}
          <div><a href="#">click here</a> to upgrade</div>
        </div>
      </Alert>
    </Snackbar>
  );
};
export default Toaster;
