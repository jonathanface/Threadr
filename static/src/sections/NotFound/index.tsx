import { Box, Button, Stack, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { NOT_FOUND_QUOTES, Quote } from "../../constants/constants";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";

type NotFoundProps = { isLoggedIn?: boolean };

export function randomQuote(): Quote {
  const i = Math.floor(Math.random() * NOT_FOUND_QUOTES.length);
  return NOT_FOUND_QUOTES[i];
}

export const NotFoundPage = ({ isLoggedIn }: NotFoundProps) => {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const quote = randomQuote();

  return (
    <Box
      sx={{ minHeight: "60vh", display: "grid", placeItems: "center", px: 2 }}
    >
      <Stack
        spacing={2}
        alignItems="center"
        textAlign="center"
        sx={{
          color: "rgba(255, 255, 255, 0.9)",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            fontWeight: 900,
            letterSpacing: -1,
            filter: (theme) =>
              `drop-shadow(2px 2px 2px ${theme.palette.mode === "dark" ? "#000" : "#1a1a1a"})`,
          }}
        >
          404
        </Typography>
        <Stack
          direction="row"
          spacing={0.25}
          alignItems="flex-start"
          justifyContent="center"
        >
          <FormatQuoteIcon
            sx={{
              transform: "scaleX(-1)", // flip to “opening” direction
              transformOrigin: "center",
              verticalAlign: "text-top",
              opacity: 0.6,
              fontSize: 22,
            }}
          />
          <Stack spacing={0.5}>
            <Typography m={0} variant="h6" fontWeight={400}>
              {quote.text}
            </Typography>
            {quote.source && (
              <Typography variant="caption">
                — {quote.source}
              </Typography>
            )}
          </Stack>
          <FormatQuoteIcon
            sx={{ verticalAlign: "text-top", opacity: 0.6, fontSize: 22 }}
          />
        </Stack>
        <Box>
          <Typography variant="body2" sx={{ mt: "16px", mb: "40px" }}>
            We couldn't find <code style={{ fontWeight: 'bold' }}>{pathname}</code>.
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              onClick={() => nav(isLoggedIn ? "/stories" : "/")}
            >
              {isLoggedIn ? "Go to Stories" : "Go Home"}
            </Button>
            <Button variant="outlined" onClick={() => nav(-1)}>
              Go Back
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};
