import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

export const SubscribePage = () => {
  const nav = useNavigate();

  return (
    <Box
      sx={(t) => ({
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        position: "relative",
        // subtle gradient “glow” that works in light & dark themes
        background: `
          radial-gradient(700px 260px at 50% -10%, ${alpha(
            t.palette.primary.main,
            0.2,
          )}, transparent 60%),
          radial-gradient(600px 220px at -10% 120%, ${alpha(
            t.palette.secondary.main,
            0.14,
          )}, transparent 60%),
          radial-gradient(600px 220px at 110% 120%, ${alpha(
            t.palette.success.main,
            0.1,
          )}, transparent 60%)
        `,
      })}
    >
      <Container
        maxWidth="md"
        sx={(t) => ({
          position: "relative",
          bgcolor: alpha(t.palette.background.paper, 0.96),
          padding: "24px",
          borderRadius: "15px",
        })}
      >
        <Stack
          spacing={1.5}
          alignItems="center"
          textAlign="center"
          sx={{ mb: 3 }}
        >
          <Typography variant="h2" fontWeight={800}>
            Full membership
          </Typography>
          <Typography variant="h6" color="text.secondary">
            $5 / month — unlimited access
          </Typography>
        </Stack>

        <Paper
          elevation={0}
          sx={(t) => ({
            mx: "auto",
            maxWidth: 620,
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: alpha(t.palette.background.paper, 0.9),
            backdropFilter: "blur(6px)",
          })}
        >
          <List dense sx={{ mb: 1 }}>
            {[
              "Unlimited documents",
              "Unlimited associations",
              "Export to other formats",
              "Cancel anytime",
            ].map((text) => (
              <ListItem key={text} disableGutters sx={{ py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckCircleOutlineIcon
                    sx={{ fontSize: 22, color: "success.main" }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={text}
                  primaryTypographyProps={{ fontSize: 16 }}
                />
              </ListItem>
            ))}
          </List>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems="center"
            justifyContent="center"
            sx={{ mt: 2 }}
          >
            <Button
              size="large"
              variant="contained"
              endIcon={<ArrowForwardIosIcon fontSize="small" />}
              onClick={() => nav("/checkout")}
            >
              Subscribe for $5/mo
            </Button>

            <Stack direction="row" spacing={0.75} alignItems="center">
              <LockOutlinedIcon fontSize="small" />
              <Typography variant="caption" color="text.secondary">
                Secure checkout by Stripe
              </Typography>
            </Stack>
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 1.5 }}
          >
            By subscribing you agree to our{" "}
            <MuiLink href="/terms" underline="hover">
              Terms
            </MuiLink>{" "}
            and{" "}
            <MuiLink href="/privacy" underline="hover">
              Privacy Policy
            </MuiLink>
            .
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};
