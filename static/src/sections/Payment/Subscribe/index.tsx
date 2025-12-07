import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  IconButton,
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
import CloseIcon from "@mui/icons-material/Close";
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
              )}, transparent 60%),
              radial-gradient(600px 220px at 110% 120%, ${alpha(
                t.palette.success.main,
                0.06,
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
          padding: { xs: "16px", sm: "24px" },
          paddingTop: { xs: "48px", sm: "56px" },
          borderRadius: "15px",
        })}
      >
        <IconButton
          onClick={() => nav(-1)}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
          }}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
        <Stack
          spacing={1.5}
          alignItems="center"
          textAlign="center"
          sx={{ mb: 3 }}
        >
          <Typography
            variant="h2"
            fontWeight={800}
            sx={{
              fontSize: { xs: "2rem", sm: "3rem", md: "3.75rem" },
              color: "text.primary",
            }}
          >
            Full membership
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1rem", sm: "1.25rem" },
              color: "text.primary",
              opacity: 0.8,
            }}
          >
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
                <ListItemIcon sx={{ minWidth: { xs: 28, sm: 32 } }}>
                  <CheckCircleOutlineIcon
                    sx={{ fontSize: { xs: 20, sm: 22 }, color: "success.main" }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={text}
                  primaryTypographyProps={{
                    fontSize: { xs: 14, sm: 16 },
                    color: "text.primary",
                  }}
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
              color="primary"
              fullWidth={{ xs: true, sm: false }}
              endIcon={<ArrowForwardIosIcon fontSize="small" />}
              onClick={() => nav("/checkout")}
              sx={(t) => ({
                py: { xs: 1.5, sm: 1 },
                fontSize: { xs: "0.95rem", sm: "1rem" },
                // Ensure good contrast in dark mode
                ...(t.palette.mode === "dark" && {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                }),
              })}
            >
              Subscribe for $5/mo
            </Button>

            <Stack direction="row" spacing={0.75} alignItems="center">
              <LockOutlinedIcon fontSize="small" sx={{ opacity: 0.7 }} />
              <Typography
                variant="caption"
                sx={{ color: "text.primary", opacity: 0.7 }}
              >
                Secure checkout by Stripe
              </Typography>
            </Stack>
          </Stack>

          <Typography
            variant="caption"
            sx={{
              display: "block",
              textAlign: "center",
              mt: 1.5,
              color: "text.primary",
              opacity: 0.7,
            }}
          >
            By subscribing you agree to our{" "}
            <MuiLink href="/terms.html" underline="hover">
              Terms
            </MuiLink>{" "}
            and{" "}
            <MuiLink href="/privacy.html" underline="hover">
              Privacy Policy
            </MuiLink>
            .
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};
