import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { StripeCardElementChangeEvent, StripeError } from "@stripe/stripe-js";
import { useNavigate } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import styles from "./paymentmethod.module.css";
import CloseIcon from "@mui/icons-material/Close";
import { PaymentMethod } from "../../types/PaymentMethod";
import axios from "axios";
import { api } from "../../api";

export const PaymentMethodPanel = () => {
  const { userDetails } = useFetchUserData();
  const [subscribeError, setSubscribeError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const { showLoader, hideLoader } = useLoader();
  const hasFetchedStripeInfo = useRef(false);
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [buttonDisplay, setButtonDisplay] = useState("normal");
  const [subtitle, setSubtitle] = useState("");

  const handleClose = useCallback(() => {
    setSubscribeError("");
    navigate(-1);
  }, [navigate]);

  const toggleButtonDisplay = () => {
    if (buttonDisplay === "inline") {
      setButtonDisplay("none");
    } else {
      setButtonDisplay("inline");
    }
  };

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
          `Unable to retrieve payment method: ${error.response?.status} ${error.message}`,
        );
      } else {
        console.error(`Unable to retrieve payment method: ${error}`);
      }
    }
  }, [userDetails]);

  const confirmCard = async () => {
    if (!userDetails) return;
    setSubscribeError("");
    try {
      if (!stripe || !elements) {
        throw new Error("Stripe is not available");
      }
      showLoader();
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }
      const { paymentMethod: stripePaymentMethod, error } =
        await stripe.createPaymentMethod({
          type: "card",
          card: cardElement,
        });
      if (error) {
        throw error;
      }

      if (
        stripePaymentMethod.id &&
        stripePaymentMethod.card?.brand &&
        stripePaymentMethod.card?.last4
      ) {
        setPaymentMethod({
          id: stripePaymentMethod.id,
          brand: stripePaymentMethod.card.brand || "Unknown",
          last_four: stripePaymentMethod.card.last4,
          expiry_month: stripePaymentMethod.card.exp_month,
          expiry_year: stripePaymentMethod.card.exp_year,
        });
        try {
          await api.put(
            "/billing/customer",
            {
              customer_id: userDetails.customer_id,
              payment_method_id: stripePaymentMethod.id,
            },
            {
              withCredentials: true,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new Error(
              `Error updating customer payment details: ${error.response?.statusText || error.message}`,
            );
          }
          throw error;
        }
        toggleButtonDisplay();
        setSubtitle("Your payment method was successfully updated.");
      }
    } catch (error: unknown) {
      console.error(error);
      const stripeError = error as StripeError;
      const defaultError =
        "There was an error updating your payment method. Please try again later.";
      if (stripeError) {
        setSubscribeError(stripeError.message || defaultError);
      } else {
        const apiError = error as Error;
        if (apiError) {
          setSubscribeError(apiError.message);
        } else {
          setSubscribeError(defaultError);
        }
      }
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (userDetails && !hasFetchedStripeInfo.current) {
      const fetchStripeInfo = async () => {
        if (!userDetails.customer_id.length) {
          navigate("/subscribe");
        }
        getExistingPaymentMethod();
        hasFetchedStripeInfo.current = true;
      };
      fetchStripeInfo();
    }
  }, [userDetails, getExistingPaymentMethod, navigate]);

  const handleCardElementChange = (e: StripeCardElementChangeEvent) => {
    if (e.error) {
      console.error(e.error.message);
    }
    if (e.complete) {
      confirmCard();
    }
  };

  const updatePaymentMethod = () => {
    setSubtitle("");
    setSubscribeError("");
    setPaymentMethod(null);
    confirmCard();
  };
  return (
    <Box className={styles.subscribePanel}>
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

      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Update your Card
        </Typography>
        {!paymentMethod ? (
          <Box sx={{ mt: 2, mb: 2 }}>
            <CardElement
              className={styles.stripeCardInput}
              onChange={handleCardElementChange}
            />
            <Button
              onClick={updatePaymentMethod}
              variant="outlined"
              sx={{ mt: 1 }}
            >
              Update
            </Button>
          </Box>
        ) : (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Current payment method: {paymentMethod.brand.toUpperCase()} ending
              in {paymentMethod.last_four}
            </Typography>
            <CardElement
              className={styles.stripeCardInput}
              onChange={handleCardElementChange}
            />
            <Button
              onClick={updatePaymentMethod}
              variant="outlined"
              sx={{ mt: 1 }}
            >
              Update
            </Button>
          </Box>
        )}
        <Typography variant="h5" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
        {subscribeError && (
          <Typography variant="body2" className={styles.error}>
            {subscribeError}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
