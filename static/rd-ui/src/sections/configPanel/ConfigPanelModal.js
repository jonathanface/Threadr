import { FormGroup } from "@mui/material";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { flipConfigPanelVisible, setUserDetails } from "../../stores/userSlice";

const ConfigPanelModal = (props) => {
  const isConfiguring = useSelector((state) => state.user.configPanelVisible);
  const userDetails = useSelector((state) => state.user.userDetails);
  const dispatch = useDispatch();
  const [error, setError] = useState("");

  useEffect(() => {}, [userDetails]);

  const handleClose = () => {
    setError("");
    dispatch(flipConfigPanelVisible());
  };

  const toggleSubscriptionRenewal = async () => {
    setError("");
    const params = {};
    params.renewing = !userDetails.renewing;

    dispatch(setIsLoaderVisible(true));
    try {
      const response = await fetch("/api/user", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.response = response;
        throw error;
      }
      const json = await response.json();
      dispatch(setUserDetails(json));
    } catch (error) {
      const errorData = error.response ? JSON.parse(error.message) : {};
      if (errorData.error) {
        setError(errorData.error);
      } else {
        setError("Unable to edit your settings at this time. Please try again later.");
      }
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
