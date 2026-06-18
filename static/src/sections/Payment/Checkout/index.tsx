import { useEffect, useRef, useState } from "react";
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
  // Snapshot the URL state on first render so the auto-fire effect and the
  // initial loading state agree.
  const urlPromoOnMountRef = useRef(searchParams.get("promo")?.trim() ?? "");
  const hasUrlPromo = urlPromoOnMountRef.current !== "";
  const [promoCode, setPromoCode] = useState(urlPromoOnMountRef.current);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  // "payment" for the typical Stripe PaymentIntent flow, "setup" when
  // a 100% promo zero-rated the first invoice — the form then collects a
  // card to be charged at renewal instead of charging now.
  const [intentMode, setIntentMode] = useState<"payment" | "setup">("payment");
  const [error, setError] = useState<string | null>(null);
  // When the URL carries ?promo=..., start in the "applying" state so we
  // never flash the form before the auto-fire effect runs.
  const [starting, setStarting] = useState(hasUrlPromo);
  const startedRef = useRef(false); // guard against React StrictMode double-fire

  const startCheckout = async (codeOverride?: string) => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const code = (codeOverride ?? promoCode).trim();
      const { data } = await api.post(
        "/billing/subscribe",
        { promo_code: code },
        { baseURL: "" },
      );
      setClientSecret(data.client_secret);
      setIntentMode(data.mode === "setup" ? "setup" : "payment");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      // Allow a retry (e.g. user fixes a bad promo code) — falls back to
      // the form with the bad code pre-filled so they can edit and try again.
      startedRef.current = false;
      const apiMsg = e?.response?.data?.error;
      setError(apiMsg || e?.message || "Unable to start checkout");
    } finally {
      setStarting(false);
    }
  };

  // Skip the "do you have a promo code?" form when one is already in the
  // URL — the user just clicked their welcome-email link, asking them to
  // re-confirm the code is friction without value.
  useEffect(() => {
    if (hasUrlPromo) {
      void startCheckout(urlPromoOnMountRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fired with a URL promo code and still in flight (no error yet) —
  // render a focused loader instead of the form so the user doesn't see
  // the input flash before the Stripe Elements appear.
  if (!clientSecret && hasUrlPromo && starting && !error) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8, gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Applying your promo code…
        </Typography>
      </Box>
    );
  }

  // Pre-promo step: user can review the offer and apply a code before we
  // create the Stripe Subscription. Also the fallback when the auto-fire
  // path hit an error — the form re-appears with the bad code pre-filled
  // so the user can edit and retry.
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
          onClick={() => startCheckout()}
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
      <CheckoutForm mode={intentMode} />
    </Elements>
  );
};

export const CheckoutForm = ({
  mode = "payment",
}: {
  mode?: "payment" | "setup";
}) => {
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

    // 2) Confirm the right Intent. SetupIntent flow runs when a 100% promo
    // zero-rated the first invoice — Stripe collects/saves a card for
    // renewal instead of charging now.
    const confirmParams = {
      return_url: window.location.origin + "/success",
    };
    const { error } =
      mode === "setup"
        ? await stripe.confirmSetup({
            elements,
            confirmParams,
            redirect: "if_required",
          })
        : await stripe.confirmPayment({
            elements,
            confirmParams,
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
