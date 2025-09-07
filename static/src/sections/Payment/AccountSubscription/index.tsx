import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Typography,
  Chip,
  CircularProgress,
  Container,
  alpha,
} from "@mui/material";
import { api } from "../../../api";
import { SubscriptionSummary } from "../../../types/billing";

export const AccountSubscriptionPage = () => {
  const [data, setData] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Box
      sx={{
        display: "grid",
        placeItems: "center",
        position: "relative",
      }}
    >
      <Container
        sx={(t) => ({
          width: 520,
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
          Membership
        </Typography>

        {loading ? (
          <CircularProgress size={24} />
        ) : error ? (
          <Chip label="Error" color="error" sx={{ mb: 2 }} />
        ) : (
          <Chip
            label={status.toUpperCase()}
            color={
              status === "active" || status === "trialing"
                ? "success"
                : "default"
            }
            sx={{ mb: 2 }}
          />
        )}

        <Typography>$5/month • cancel anytime</Typography>

        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={
            status.toUpperCase() !== "NONE"
              ? openPortal
              : () => {
                  window.location.assign("/subscribe");
                }
          }
          disabled={loading || !!error}
        >
          {status.toUpperCase() === "NONE" ? "JOIN NOW" : "MANAGE BILLING"}
        </Button>
      </Container>
    </Box>
  );
};
