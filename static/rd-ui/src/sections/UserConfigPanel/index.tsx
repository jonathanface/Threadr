import { FormGroup } from "@mui/material";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useContext, useEffect, useState } from "react";
import { useAppNavigation } from "../../hooks/useAppNavigation";
import { useLoader } from "../../hooks/useLoader";
import { AlertLink, AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import { UserContext } from "../../contexts/user";

export const ConfigPanelModal = () => {
  const userData = useContext(UserContext);
  if (!userData) {
    return <div />
  }
  const { userDetails, setUserDetails } = userData;
  const { isConfigPanelOpen, setIsSubscriptionFormOpen, setIsConfigPanelOpen } =
    useAppNavigation();
  const { setIsLoaderVisible } = useLoader();
  const { setAlertState } = useToaster();

  const [isCustomer, setIsCustomer] = useState(true);
  const [isRenewing, setIsRenewing] = useState(false);
  const [toggleLabel, setToggleLabel] = useState("Subscribe");

  const subscribe = () => {
    handleClose();
    setIsSubscriptionFormOpen(true);
  };

  const toggleSubscriptionRenewal = async () => {
    if (!userDetails) return;
    setIsLoaderVisible(true);
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
      setUserDetails(json);
    } catch (error: unknown) {
      console.error(`Error: ${error}`);
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
      handleClose();
      return;
    } finally {
      setIsLoaderVisible(false);
    }
  };

  useEffect(() => {
    if (!userDetails) return;
    if (!userDetails.subscription_id.length) {
      setIsRenewing(false);
      setIsCustomer(false);
      setToggleLabel("Subscribe");
    }
    if (isCustomer) {
      setIsRenewing(userDetails.renewing);
      setToggleLabel("Auto-Renew Subscription");
    }
  }, [userDetails, isCustomer]);

  const handleClose = () => {
    setIsConfigPanelOpen(false);
  };

  return (
    <Dialog open={isConfigPanelOpen} onClose={handleClose}>
      <DialogTitle>Account Settings</DialogTitle>
      <DialogContent>
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
      </DialogContent>
    </Dialog>
  );
};
