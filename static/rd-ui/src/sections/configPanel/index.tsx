import { FormGroup } from "@mui/material";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { AppDispatch, RootState } from "../../stores/store";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { flipConfigPanelVisible, setUserDetails } from "../../stores/userSlice";
import { AlertLink, AlertToast, AlertToastType } from "../../utils/Toaster";

const ConfigPanelModal = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();
  const isConfiguring = useAppSelector((state) => state.user.configPanelVisible);
  const userDetails = useAppSelector((state) => state.user.userDetails);
  const [error, setError] = useState("");

  useEffect(() => {}, [userDetails]);

  const handleClose = () => {
    setError("");
    dispatch(flipConfigPanelVisible());
  };

  const toggleSubscriptionRenewal = async () => {
    setError("");
    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/user", {
        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ renewing: !userDetails.renewing }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        throw error;
      }
      const json = await response.json();
      dispatch(setUserDetails(json));
    } catch (error: any) {
      const alertLink: AlertLink = {
        url: "mailto:support@docter.io",
        text: "support@docter.io",
      };
      const confirmFormMessage: AlertToast = {
        title: "Cannot edit your settings",
        message: "Cannot edit your settings at this time. Please try again later, or contact support.",
        severity: AlertToastType.error,
        link: alertLink,
        open: true,
      };
      dispatch(setIsLoaderVisible(false));
      dispatch(setAlert(confirmFormMessage));
      handleClose();
      return;
    }
    dispatch(setIsLoaderVisible(false));
  };

  return (
    <Dialog open={isConfiguring} onClose={handleClose}>
      <DialogTitle>Account Settings</DialogTitle>
      <DialogContent>
        <Box component="form">
          {userDetails && userDetails.subscription_id && userDetails.subscription_id.length ? (
            <FormGroup>
              <FormControlLabel
                control={<Switch onChange={toggleSubscriptionRenewal} checked={userDetails.renewing || false} />}
                label="Auto-Renew Subscription"
              />
            </FormGroup>
          ) : (
            <div>nothing here yet</div>
          )}
          <div>{error}</div>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ConfigPanelModal;
