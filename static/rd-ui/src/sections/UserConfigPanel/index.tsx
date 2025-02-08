import { useEffect, useState } from "react";
import { Box, FormControlLabel, FormGroup, IconButton, Switch, Typography } from "@mui/material";
import { useLoader } from "../../hooks/useLoader";
import { AlertLink, AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import styles from './configpanel.module.css';
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { UserDetails } from "../../types/User";
import { useFetchUserData } from "../../hooks/useFetchUserData";

export const ConfigPanel = () => {
  const { userDetails, setUserDetails } = useFetchUserData();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();

  const [isCustomer, setIsCustomer] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [toggleLabel, setToggleLabel] = useState("Subscribe");
  const navigate = useNavigate();


  const subscribe = () => {
    // Replace this with your subscription form handling logic if needed.
    console.log("Subscribe function called");
  };

  const handleClose = () => {
    navigate("/")
  }

  // Function to toggle auto-renewal on the user's subscription.
  const toggleSubscriptionRenewal = async () => {
    if (!userDetails) return;
    try {
      showLoader();
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
      const json: UserDetails = await response.json();
      setUserDetails({ ...json });
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

  useEffect(() => {
    if (!userDetails) return;
    setIsCustomer(userDetails.customer_id.length ? true : false);

    if (!userDetails.customer_id.length || !userDetails.subscription_id.length) {
      setIsRenewing(false);
      setToggleLabel("Subscribe");
    } else {
      setIsRenewing(userDetails.renewing);
      setToggleLabel("Auto-Renew Subscription");
    }
  }, [userDetails]);

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
