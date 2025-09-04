import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  FormGroup,
  IconButton,
  Switch,
  Typography,
} from "@mui/material";
import { useLoader } from "../../hooks/useLoader";
import { AlertLink, AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import styles from "./configpanel.module.css";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { UserDetails } from "../../types/User";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import { PaymentMethod } from "../../types/PaymentMethod";
import { UCWords } from "../../components/ThreadWriter/utilities";
import axios from "axios";
import { api } from "../../api";

export const ConfigPanel = () => {
  const { userDetails, setUserDetails } = useFetchUserData();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();

  const [isCustomer, setIsCustomer] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [toggleLabel, setToggleLabel] = useState("Subscribe");
  const navigate = useNavigate();

  const getExistingPaymentMethod = useCallback(async () => {
    if (!userDetails) return;
    try {
      const { data: payment } = await api.get<{
        id: string;
        brand?: string;
        last_four: string;
        expiration_month: number;
        expiration_year: number;
      }>("/billing/customer/payment", {
        withCredentials: true,
      });

      setPaymentMethod({
        id: payment.id,
        brand: payment.brand || "Unknown",
        last_four: payment.last_four,
        expiry_month: payment.expiration_month,
        expiry_year: payment.expiration_year,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Unable to retrieve payment method: ${error.response?.status} ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error(`Unable to retrieve payment method: ${error}`);
      }
    }
  }, [userDetails]);

  const subscribe = () => {
    navigate("/payment");
  };

  const handleClose = () => {
    navigate(-1);
  };

  const toggleSubscriptionRenewal = async () => {
    if (!userDetails) return;
    try {
      showLoader();

      const { data: json } = await api.put<UserDetails>(
        "/user",
        { renewing: !userDetails.renewing },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
          validateStatus: (status) => {
            // Let 2xx and 303 resolve so we can handle redirect logic
            return (status >= 200 && status < 300) || status === 303;
          },
        },
      );

      // Axios won't throw on 303, so handle it explicitly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((json as any)?.status === 303) {
        console.error("Received 303 redirect");
        navigate("/subscribe");
        return;
      }

      setUserDetails({ ...json });
    } catch (error) {
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
    if (
      !userDetails.customer_id.length ||
      !userDetails.subscription_id.length
    ) {
      setIsRenewing(false);
      setToggleLabel("Subscribe");
    } else {
      setIsRenewing(userDetails.renewing);
      setToggleLabel("Auto-Renew Subscription");
      if (userDetails.renewing) {
        getExistingPaymentMethod();
      }
    }
  }, [userDetails, getExistingPaymentMethod]);

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
          {!isCustomer ? (
            // When the user is not a customer, show the Signup button with an explanatory blurb.
            <Box display="flex" alignItems="center">
              <Button onClick={subscribe} variant="contained">
                Subscribe
              </Button>
              <Typography variant="body2" sx={{ ml: 2 }}>
                Subscribe and gain access to premium features.
              </Typography>
            </Box>
          ) : (
            // When the user is a customer, show the switch for auto-renewal.
            <Box className={styles.renewControls}>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      onChange={toggleSubscriptionRenewal}
                      checked={isRenewing}
                    />
                  }
                  label={toggleLabel}
                />
                {isRenewing && paymentMethod ? (
                  <Box className={styles.paymentMethod}>
                    Subscribed via {UCWords(paymentMethod?.brand)} ending in{" "}
                    {paymentMethod?.last_four}
                  </Box>
                ) : (
                  ""
                )}
              </Box>
              <Button size="small" onClick={subscribe} variant="contained">
                Change Payment Method
              </Button>
            </Box>
          )}
        </FormGroup>
      </Box>
    </Box>
  );
};
