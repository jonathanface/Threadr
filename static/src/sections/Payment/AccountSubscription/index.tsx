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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../../../api";
import { SubscriptionSummary } from "../../../types/billing";

export const AccountSubscriptionPage = () => {
  const navigate = useNavigate();
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
          sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}
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
            color={
              status === "active" || status === "trialing"
                ? "success"
                : "default"
            }
            sx={{ mb: 2 }}
          />
        )}

        <Typography sx={{ fontSize: { xs: "0.9rem", sm: "1rem" } }}>
          $5/month • cancel anytime
        </Typography>

        <Button
          variant="outlined"
          fullWidth
          sx={{
            mt: 2,
            fontSize: { xs: "0.9rem", sm: "1rem" },
            py: { xs: 1.5, sm: 1 },
          }}
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
