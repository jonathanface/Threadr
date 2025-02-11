import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Typography,
} from "@mui/material";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { StripeCardElementChangeEvent } from "@stripe/stripe-js";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { useNavigate } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import styles from "./subscribePanel.module.css";
import CloseIcon from "@mui/icons-material/Close";

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
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
    navigate('/stories');
  }, [navigate]);

  const confirmCard = async () => {
    if (!userDetails) return;
    setSubscribeError("");
    try {
      if (!stripe || !elements) {
        throw new Error("Stripe is not available");
      }
      showLoader();
      const response = await fetch("/billing/card", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userDetails.customer_id }),
      });
      if (!response.ok) {
        throw new Error(`Error confirming card: ${response.statusText}`);
      }
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
        throw new Error(error.message);
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
        });
        const setPaymentResults = await fetch("/billing/customer", {
          credentials: "include",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: userDetails.customer_id,
            payment_method_id: stripePaymentMethod.id,
          }),
        });
        if (!setPaymentResults.ok) {
          throw new Error(
            `Error updating customer payment details: ${setPaymentResults.statusText}`
          );
        }
        setButtonLabel("CONFIRM");
        setSubtitle("")

      }
    } catch (error: unknown) {
      console.error(error);
      setSubscribeError(
        "There was an error updating your payment method. Please try again later."
      );
    } finally {
      hideLoader();
    }
  };

  const createStripeCustomer = useCallback(async () => {
    try {
      showLoader();
      const response = await fetch("/billing/customer", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Error creating customer: ${response.statusText}`);
      }
      const json = await response.json();
      if (json && json.id) {
        if (json.payment_methods && json.payment_methods.length) {
          const defaultPayment = json.payment_methods.filter(
            (method: PaymentMethod) => method.is_default === true
          );
          if (defaultPayment.length) {
            setPaymentMethod(defaultPayment[0]);
          }
        }
        if (userDetails) setUserDetails({ ...userDetails, customer_id: json.id });
      }
    } catch (error) {
      setSubscribeError(
        "There was an error registering you with our payment service. Please try again later."
      );
      console.error(error);
    } finally {
      hideLoader();
    }
  }, [setPaymentMethod, userDetails, setUserDetails, showLoader, hideLoader]);

  const subscribe = async () => {
    if (!paymentMethod || !product) return;
    setSubscribeError("");
    try {
      showLoader();
      const response = await fetch("/billing/subscribe", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method_id: paymentMethod.id,
          customer_id: userDetails?.customer_id,
          price_id: product.price_id,
        }),
      });
      if (!response.ok) {
        throw response;
      }
      const json = await response.json();
      setAlertState({
        title: "Welcome",
        message:
          "Your subscription is active until " +
          new Date(json.period_end).toLocaleString() +
          " and will automatically renew. If you had previously subscribed, any suspended stories will be restored in the next 30 minutes.",
        severity: AlertToastType.success,
        timeout: 10000,
        open: true,
      });
      if (userDetails) setUserDetails({ ...userDetails, renewing: true, expired: false, subscription_id: json.subscription_id });
      handleClose();
    } catch (error) {
      console.error(`Error creating subscription: ${(error as Response).statusText}`);
      if ((error as Response).status === 409) {
        setSubscribeError(
          "You appear to already have an active subscription. Please contact support@docter.io if this is an error."
        );
        return;
      }
      setSubscribeError(
        "There was an error creating your subscription. Please try again later."
      );
    } finally {
      hideLoader();
    }
  };

  const getProducts = useCallback(async () => {
    try {
      showLoader();
      const response = await fetch("/billing/products", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const data = await response.json();
      setProduct(data[0]);
      setSubtitle(data[0].description);
    } catch (error) {
      setSubscribeError(
        "We are unable to process subscriptions at this time. Please try again later."
      );
      console.error(error);
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
    <Box
      className={styles.subscribePanel}
    >
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
              <Button onClick={updatePaymentMethod} variant="outlined" sx={{ mt: 1 }}>
                Change Payment Method
              </Button>
            </Box>
          )}
          {subscribeError && (
            <Typography variant="body2" className={styles.error}>
              {subscribeError}
            </Typography>
          )}
          <Box sx={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <Button onClick={subscribe}>{buttonLabel}</Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" align="center">
            {subscribeError}
          </Typography>
        </Box>
      )
      }
    </Box >

  );
};

export default SubscribePanel;
