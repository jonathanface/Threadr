import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../api";
import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY);

const getStripeAppearance = (): import("@stripe/stripe-js").Appearance => {
  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";
  return isDark
    ? {
        theme: "night",
        variables: {
          colorPrimary: "#d97706",
          colorBackground: "#292524",
          colorText: "#fafaf9",
          colorTextSecondary: "#d6d3d1",
          borderRadius: "12px",
        },
      }
    : {
        theme: "stripe",
        variables: {
          colorPrimary: "#0e7c5f",
          borderRadius: "12px",
        },
      };
};

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [promoCode, setPromoCode] = useState(
    searchParams.get("promo")?.trim() ?? "",
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false); // guard against React StrictMode double-fire

  const startCheckout = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const { data } = await api.post(
        "/billing/subscribe",
        { promo_code: promoCode.trim() },
        { baseURL: "" },
      );
      setClientSecret(data.client_secret);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      // Allow a retry (e.g. user fixes a bad promo code).
      startedRef.current = false;
      const apiMsg = e?.response?.data?.error;
      setError(apiMsg || e?.message || "Unable to start checkout");
    } finally {
      setStarting(false);
    }
  };

  // Pre-promo step: user can review the offer and apply a code before we
  // create the Stripe Subscription. Once they continue, the Stripe Elements
  // mount with the returned client secret.
  if (!clientSecret) {
    return (
      <Box
        sx={(t) => ({
          maxWidth: 520,
          mx: "auto",
          py: 6,
          bgcolor: alpha(t.palette.background.paper, 0.96),
          padding: { xs: "16px", sm: "24px" },
          paddingTop: { xs: "48px", sm: "56px" },
          borderRadius: "15px",
          marginTop: { xs: "24px", sm: "48px" },
          border: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(6px)",
          position: "relative",
        })}
      >
        <IconButton
          onClick={() => navigate(-1)}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
        <Typography variant="h5" gutterBottom sx={{ color: "text.primary" }}>
          Subscribe — $10/month
        </Typography>
        <TextField
          label="Promo code (optional)"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          fullWidth
          margin="normal"
          autoComplete="off"
          inputProps={{ "aria-label": "Promo code" }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
          onClick={startCheckout}
          disabled={starting}
        >
          {starting ? (
            <CircularProgress size={20} sx={{ color: "inherit" }} />
          ) : (
            "Continue to payment"
          )}
        </Button>
      </Box>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: getStripeAppearance(),
        loader: "auto",
      }}
    >
      <CheckoutForm />
    </Elements>
  );
};

export const CheckoutForm = () => {
  const navigate = useNavigate();
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
        padding: { xs: "16px", sm: "24px" },
        paddingTop: { xs: "48px", sm: "56px" },
        borderRadius: "15px",
        marginTop: { xs: "24px", sm: "48px" },
        border: "1px solid",
        borderColor: "divider",
        backdropFilter: "blur(6px)",
        position: "relative",
      })}
    >
      <IconButton
        onClick={() => navigate(-1)}
        sx={{
          position: "absolute",
          right: 8,
          top: 8,
        }}
        aria-label="close"
      >
        <CloseIcon />
      </IconButton>
      <Typography variant="h5" gutterBottom sx={{ color: "text.primary" }}>
        Subscribe — $10/month
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
