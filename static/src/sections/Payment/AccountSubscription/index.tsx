import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Typography,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../../../api";
import { SubscriptionSummary } from "../../../types/billing";
import { useFetchUserData } from "../../../hooks/useFetchUserData";
import { useSelections } from "../../../hooks/useSelections";
import { usePostHog } from "@posthog/react";

export const AccountSubscriptionPage = () => {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { setIsLoggedIn } = useFetchUserData();
  const { setStory } = useSelections();
  const [data, setData] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data } = await api.get<SubscriptionSummary>(
          "/billing/summary",
          {
            baseURL: "",
          },
        );
        setData(data);
      } catch (err) {
        setError("Failed to load subscription summary");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  const status = data?.status || "none";
  const cancelAtPeriodEnd = data?.cancelAtPeriodEnd || false;
  const hasExpiredSubscription =
    status === "canceled" ||
    status === "incomplete_expired" ||
    status === "unpaid";
  const hasActiveSubscription = status === "active" || status === "trialing";
  const hasIncompleteSubscription = status === "incomplete";
  const hasNeverSubscribed = status === "none";
  const isScheduledToCancel = hasActiveSubscription && cancelAtPeriodEnd;

  const openPortal = async () => {
    try {
      const { data } = await api.post<{ url: string }>(
        "/billing/portal-session",
        null,
        { baseURL: "", headers: { "X-Return-Url": window.location.href } },
      );
      window.location.assign(data.url);
    } catch (err) {
      console.error("Failed to open portal:", err);
      setError("Could not open billing portal");
    }
  };

  const handleSubscribe = () => {
    navigate("/subscribe");
  };

  const getStatusColor = () => {
    if (hasActiveSubscription) return "success";
    if (hasIncompleteSubscription) return "info";
    if (hasExpiredSubscription) return "warning";
    return "default";
  };

  const getButtonText = () => {
    if (hasNeverSubscribed) return "JOIN NOW";
    if (hasIncompleteSubscription) return "COMPLETE PAYMENT";
    if (hasExpiredSubscription) return "REACTIVATE";
    return "MANAGE BILLING";
  };

  const getButtonAction = () => {
    if (hasNeverSubscribed || hasExpiredSubscription || hasIncompleteSubscription) {
      return handleSubscribe; // All need to go through checkout
    }
    return openPortal; // Only active subscriptions can manage via portal
  };

  const handleDeleteAccount = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api.delete("/user");

      posthog?.capture("account_deleted");
      posthog?.reset();
      // Account deleted successfully - sign out
      setDeleteDialogOpen(false);
      setIsLoggedIn(false);
      setStory(undefined);
      navigate("/");
    } catch (err) {
      console.error("Failed to delete account:", err);
      setError("Failed to delete account. Please try again or contact support.");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <Box
      sx={(t) => ({
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        position: "relative",
        // subtle gradient "glow" - more subtle in dark mode
        background:
          t.palette.mode === "dark"
            ? `
              radial-gradient(700px 260px at 50% -10%, ${alpha(
                t.palette.primary.main,
                0.12,
              )}, transparent 60%),
              radial-gradient(600px 220px at -10% 120%, ${alpha(
                t.palette.secondary.main,
                0.08,
              )}, transparent 60%)
            `
            : `
              radial-gradient(700px 260px at 50% -10%, ${alpha(
                t.palette.primary.main,
                0.2,
              )}, transparent 60%),
              radial-gradient(600px 220px at -10% 120%, ${alpha(
                t.palette.secondary.main,
                0.14,
              )}, transparent 60%)
            `,
      })}
    >
      <Container
        sx={(t) => ({
          width: { xs: "calc(100% - 32px)", sm: 520 },
          maxWidth: { xs: "100%", sm: 520 },
          mx: "auto",
          py: { xs: 3, sm: 6 },
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
        <Typography
          variant="h5"
          gutterBottom
          sx={{ fontSize: { xs: "1.5rem", sm: "2rem" }, color: "text.primary" }}
        >
          Membership
        </Typography>

        {loading ? (
          <CircularProgress size={24} />
        ) : error ? (
          <Chip label="Error" color="error" sx={{ mb: 2 }} />
        ) : (
          <Chip
            label={status.toUpperCase()}
            color={getStatusColor() as "success" | "warning" | "default"}
            sx={{ mb: 2 }}
          />
        )}

        <Typography sx={{ fontSize: { xs: "0.9rem", sm: "1rem" }, mb: 1, color: "text.primary" }}>
          $10/month • cancel anytime
        </Typography>

        {isScheduledToCancel && data?.currentPeriodEnd && (
          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              color: "warning.main",
              mb: 2,
            }}
          >
            Your subscription will end on{" "}
            {new Date(data.currentPeriodEnd).toLocaleDateString()}. You can
            reactivate anytime before then.
          </Typography>
        )}

        {hasIncompleteSubscription && (
          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              color: "info.main",
              mb: 2,
            }}
          >
            Your payment is being processed. Complete payment to activate your
            subscription.
          </Typography>
        )}

        {hasExpiredSubscription && (
          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              color: "warning.main",
              mb: 2,
            }}
          >
            Your subscription has expired. Reactivate to restore access to
            premium features.
          </Typography>
        )}

        {hasNeverSubscribed && (
          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              color: "text.secondary",
              mb: 2,
            }}
          >
            Get unlimited documents, unlimited associations, and export your
            stories to multiple formats.
          </Typography>
        )}

        <Button
          variant="outlined"
          fullWidth
          sx={{
            mt: 2,
            fontSize: { xs: "0.9rem", sm: "1rem" },
            py: { xs: 1.5, sm: 1 },
          }}
          onClick={getButtonAction()}
          disabled={loading || !!error}
        >
          {getButtonText()}
        </Button>

        <Divider sx={{ my: 4 }} />

        <Box sx={{ mt: 4 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1rem", sm: "1.125rem" },
              color: "error.main",
              fontWeight: 600,
              mb: 1,
            }}
          >
            Danger Zone
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              color: "text.secondary",
              mb: 2,
            }}
          >
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </Typography>
          <Button
            variant="contained"
            color="error"
            fullWidth
            sx={{
              fontSize: { xs: "0.9rem", sm: "1rem" },
              py: { xs: 1.5, sm: 1 },
            }}
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Delete Account"
            )}
          </Button>
        </Box>
      </Container>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: (t) => ({
            bgcolor: alpha(t.palette.background.paper, 0.98),
            backdropFilter: "blur(8px)",
            borderRadius: "12px",
            border: "1px solid",
            borderColor: t.palette.divider,
          }),
        }}
      >
        <DialogTitle sx={(t) => ({ color: t.palette.text.primary })}>
          Delete Account
        </DialogTitle>
        <DialogContent>
          <DialogContentText
            sx={(t) => ({ color: t.palette.text.secondary })}
          >
            Are you sure you want to delete your account? This action cannot be
            undone and will permanently delete:
          </DialogContentText>
          <Box component="ul" sx={{ mt: 2, pl: 2 }}>
            <Typography
              component="li"
              sx={(t) => ({ mb: 0.5, color: t.palette.text.secondary })}
            >
              All your stories and chapters
            </Typography>
            <Typography
              component="li"
              sx={(t) => ({ mb: 0.5, color: t.palette.text.secondary })}
            >
              All associations and images
            </Typography>
            <Typography
              component="li"
              sx={(t) => ({ mb: 0.5, color: t.palette.text.secondary })}
            >
              Your subscription (if active)
            </Typography>
            <Typography
              component="li"
              sx={(t) => ({ color: t.palette.text.secondary })}
            >
              All account data
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deletingAccount}
            sx={(t) => ({ color: t.palette.text.primary })}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteAccount}
            color="error"
            variant="contained"
            disabled={deletingAccount}
          >
            {deletingAccount ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Delete"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
