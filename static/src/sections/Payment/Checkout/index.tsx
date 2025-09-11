import { useEffect, useRef, useState } from "react";
import { api } from "../../../api";
import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY);
export const CheckoutPage = () => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requested = useRef(false); // avoid duplicate calls in React StrictMode

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    (async () => {
      try {
        // POST body is empty; config is 3rd arg if you ever need it
        const { data } = await api.post(
          "/billing/subscribe",
          {},
          { baseURL: "" },
        );
        setClientSecret(data.client_secret);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        setError(e?.message || "Unable to start checkout");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!clientSecret) {
    return <Alert severity="error">Missing client secret from server.</Alert>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret, // <-- REQUIRED for Payment Element
        appearance: {},
        loader: "auto",
      }}
    >
      <CheckoutForm />
    </Elements>
  );
};

export const CheckoutForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErrMsg(null);

    // 1) Validate/complete the Payment Element first
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setSubmitting(false);
      setErrMsg(
        submitError.message || "Please check your details and try again.",
      );
      return;
    }

    // 2) Then confirm the payment
    const { error } = await stripe.confirmPayment({
      elements,
      // clientSecret is optional here if you've passed it to <Elements options={{ clientSecret }}>
      confirmParams: {
        return_url: window.location.origin + "/success",
      },
      redirect: "if_required",
    });

    setSubmitting(false);

    if (error) {
      setErrMsg(error.message || "Payment failed");
      return;
    }

    // If no redirect occurred and no error, treat as success
    window.location.assign("/success");
  };

  return (
    <Box
      sx={(t) => ({
        maxWidth: 520,
        mx: "auto",
        py: 6,
        bgcolor: alpha(t.palette.background.paper, 0.96),
        padding: "24px",
        borderRadius: "15px",
        marginTop: "48px",
        border: "1px solid",
        borderColor: "divider",
        backdropFilter: "blur(6px)",
      })}
    >
      <Typography variant="h5" gutterBottom>
        Subscribe — $5/month
      </Typography>
      <PaymentElement />
      {errMsg && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errMsg}
        </Alert>
      )}
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        onClick={handleSubmit}
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? "Processing..." : "Start Membership"}
      </Button>
    </Box>
  );
};
