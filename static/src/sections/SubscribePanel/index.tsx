import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { StripeCardElementChangeEvent, StripeError } from "@stripe/stripe-js";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { useNavigate } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import styles from "./subscribePanel.module.css";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";
import { api } from "../../api";

interface PaymentMethod {
  id: string;
  brand: string;
  last_four: string;
  is_default?: boolean;
}

interface Product {
  product_id: string;
  price_id: string;
  name: string;
  description: string;
  billing_amount: string;
  billing_frequency: string;
}

export const SubscribePanel = () => {
  const { userDetails, setUserDetails } = useFetchUserData();
  const [subscribeError, setSubscribeError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [product, setProduct] = useState<Product | null>(null);
  const { setAlertState } = useToaster();
  const { showLoader, hideLoader } = useLoader();
  const hasFetchedStripeInfo = useRef(false);
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [buttonLabel, setButtonLabel] = useState("UPDATE");
  const [subtitle, setSubtitle] = useState("");

  const handleClose = useCallback(() => {
    setSubscribeError("");
    navigate(-1);
  }, [navigate]);

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
      if (error) throw error;
      if (
        stripePaymentMethod.id &&
        stripePaymentMethod.card?.brand &&
        stripePaymentMethod.card?.last4
      ) {
        setPaymentMethod({
          id: stripePaymentMethod.id,
          brand: stripePaymentMethod.card.brand || "Unknown",
          last_four: stripePaymentMethod.card.last4,
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
              `Error updating customer payment details: ${
                error.response?.statusText || error.message
              }`,
            );
          }
          throw error;
        }
        setButtonLabel("CONFIRM");
        setSubtitle("");
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

  const createStripeCustomer = useCallback(async () => {
    try {
      showLoader();

      const { data: json } = await api.post<{
        id: string;
        payment_methods?: PaymentMethod[];
      }>(
        "/billing/customer",
        {},
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
        },
      );

      if (json && json.id) {
        if (json.payment_methods && json.payment_methods.length) {
          const defaultPayment = json.payment_methods.filter(
            (method: PaymentMethod) => method.is_default === true,
          );
          if (defaultPayment.length) {
            setPaymentMethod(defaultPayment[0]);
          }
        }
        if (userDetails) {
          setUserDetails({ ...userDetails, customer_id: json.id });
        }
      }
    } catch (error) {
      setSubscribeError(
        "There was an error registering you with our payment service. Please try again later.",
      );

      if (axios.isAxiosError(error)) {
        console.error(
          `Error creating customer: ${error.response?.status} ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error(error);
      }
    } finally {
      hideLoader();
    }
  }, [setPaymentMethod, userDetails, setUserDetails, showLoader, hideLoader]);

  const subscribe = async () => {
    if (!paymentMethod || !product || !userDetails) return;
    setSubscribeError("");

    try {
      showLoader();

      const { data: json } = await api.post<{
        period_end: string;
        subscription_id: string;
      }>(
        "/billing/subscribe",
        {
          payment_method_id: paymentMethod.id,
          customer_id: userDetails.customer_id,
          price_id: product.price_id,
        },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
        },
      );

      const expiry = new Date(json.period_end).toLocaleString();
      setAlertState({
        title: "Welcome",
        message: `Your subscription is active until ${expiry} and will automatically renew.`,
        severity: AlertToastType.success,
        timeout: null,
        open: true,
      });

      if (userDetails) {
        setUserDetails({
          ...userDetails,
          renewing: true,
          expired: false,
          subscription_id: json.subscription_id,
        });
      }

      handleClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error creating subscription: ${error.response?.status} ${error.response?.statusText || error.message}`,
        );

        if (error.response?.status === 409) {
          setSubscribeError(
            "You appear to already have an active subscription. Please contact support@docter.io if this is an error.",
          );
          return;
        }
      } else {
        console.error(error);
      }

      setSubscribeError(
        "There was an error creating your subscription. Please try again later.",
      );
    } finally {
      hideLoader();
    }
  };

  const getProducts = useCallback(async () => {
    try {
      showLoader();

      const { data } = await api.get<Product[]>("/billing/products", {
        withCredentials: true,
      });

      if (data && data.length > 0) {
        setProduct(data[0]);
        setSubtitle(data[0].description);
      }
    } catch (error) {
      setSubscribeError(
        "We are unable to process subscriptions at this time. Please try again later.",
      );

      if (axios.isAxiosError(error)) {
        console.error(
          `Error fetching billing products: ${error.response?.status} ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error(error);
      }
    } finally {
      hideLoader();
    }
  }, [showLoader, hideLoader]);

  useEffect(() => {
    if (userDetails && !hasFetchedStripeInfo.current) {
      const fetchStripeInfo = async () => {
        if (!userDetails.customer_id.length) {
          await createStripeCustomer();
        }
        getProducts();
        hasFetchedStripeInfo.current = true;
      };
      fetchStripeInfo();
    }
  }, [userDetails, createStripeCustomer, getProducts]);

  const handleCardElementChange = (e: StripeCardElementChangeEvent) => {
    if (e.error) {
      console.error(e.error.message);
    }
    if (e.complete) {
      confirmCard();
    }
  };

  const updatePaymentMethod = () => {
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

      {product ? (
        <Box>
          <Typography variant="h5" sx={{ mb: 2 }}>
            {product.name}
          </Typography>
          <Typography variant="h6" className={styles.productDescription}>
            {subtitle}
          </Typography>
          {!paymentMethod ? (
            <Box sx={{ mt: 2, mb: 2 }}>
              <CardElement
                className={styles.stripeCardInput}
                onChange={handleCardElementChange}
              />
            </Box>
          ) : (
            <Box sx={{ mt: 2, mb: 2 }}>
              <Typography variant="body2">
                Subscribe with {paymentMethod.brand.toUpperCase()} ending in{" "}
                {paymentMethod.last_four}
              </Typography>
              <Button
                onClick={updatePaymentMethod}
                variant="outlined"
                sx={{ mt: 1 }}
              >
                Change Payment Method
              </Button>
            </Box>
          )}
          {subscribeError && (
            <Typography variant="body2" className={styles.error}>
              {subscribeError}
            </Typography>
          )}
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}
          >
            <Button onClick={subscribe}>{buttonLabel}</Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" align="center">
            {subscribeError}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SubscribePanel;
