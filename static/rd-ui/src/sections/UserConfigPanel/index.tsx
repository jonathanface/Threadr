import { useContext, useEffect, useState } from "react";
import { Box, FormControlLabel, FormGroup, IconButton, Switch, Typography } from "@mui/material";
import { useLoader } from "../../hooks/useLoader";
import { AlertLink, AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import { UserContext } from "../../contexts/user";
import styles from './configpanel.module.css';
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";

export const ConfigPanel = () => {
  const userData = useContext(UserContext);
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();

  const [isCustomer, setIsCustomer] = useState(true);
  const [isRenewing, setIsRenewing] = useState(false);
  const [toggleLabel, setToggleLabel] = useState("Subscribe");
  const navigate = useNavigate();


  // Function to initiate a new subscription.
  const subscribe = () => {
    // Replace this with your subscription form handling logic if needed.
    console.log("Subscribe function called");
  };

  const handleClose = () => {
    navigate("/")
  }

  // Function to toggle auto-renewal on the user's subscription.
  const toggleSubscriptionRenewal = async () => {
    if (!userData?.userDetails) return;
    try {
      showLoader();
      const response = await fetch("/api/user", {
        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ renewing: !userData.userDetails.renewing }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(JSON.stringify(errorData));
        error.message = response.statusText;
        throw error;
      }
      const json = await response.json();
      console.log("User settings updated", json);
      // Optionally update your user context here if needed.
    } catch (error: unknown) {
      console.error(`Error updating subscription settings: ${error}`);
      const alertLink: AlertLink = {
        url: "mailto:support@docter.io",
        text: "support@docter.io",
      };
      setAlertState({
        title: "Cannot edit your settings",
        message:
          "Cannot edit your settings at this time. Please try again later, or contact support.",
        severity: AlertToastType.error,
        link: alertLink,
        open: true,
      });
      return;
    } finally {
      hideLoader();
    }
  };

  // Update component state based on user details.
  useEffect(() => {
    if (!userData?.userDetails) return;
    if (!userData.userDetails.subscription_id.length) {
      setIsRenewing(false);
      setIsCustomer(false);
      setToggleLabel("Subscribe");
    } else if (isCustomer) {
      setIsRenewing(userData.userDetails.renewing);
      setToggleLabel("Auto-Renew Subscription");
    }
  }, [userData?.userDetails, isCustomer]);

  return (
    <Box className={styles.configPanel}>
      <IconButton
        onClick={handleClose}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
        }}
        aria-label="close"
      >
        <CloseIcon />
      </IconButton>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Account Settings
      </Typography>
      <Box component="form">
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                onChange={() =>
                  !isCustomer ? subscribe() : toggleSubscriptionRenewal()
                }
                checked={isRenewing}
              />
            }
            label={toggleLabel}
          />
        </FormGroup>
      </Box>
    </Box>
  );
};
