import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { api } from "../../../api";

export const SuccessPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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
          width: "400px",
          textAlign: "center",
          py: 8,
          bgcolor: alpha(t.palette.background.paper, 0.96),
          padding: "24px",
          borderRadius: "15px",
          marginTop: "48px",
          border: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(6px)",
        })}
      >
        {loading ? (
          <CircularProgress size={24} />
        ) : error ? (
          <Chip label="Error" color="error" sx={{ mb: 2 }} />
        ) : (
          <>
            <Typography variant="h4" gutterBottom>
              You're all set!
            </Typography>
            <Typography gutterBottom>Your membership is active.</Typography>
            <Button variant="contained" sx={{ mt: 3 }} onClick={openPortal}>
              Manage Billing
            </Button>
          </>
        )}
      </Container>
    </Box>
  );
};
