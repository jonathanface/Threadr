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
          color: "#FFF",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            fontWeight: 900,
            letterSpacing: -1,
            filter: "drop-shadow(2px 2px 2px #1a1a1a);",
          }}
        >
          404
        </Typography>
        <Stack
          direction="row"
          spacing={1.25}
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
            <Typography m={0} variant="body1">
              {quote.text}
            </Typography>
            {quote.source && (
              <Typography variant="caption" color="text.secondary">
                — {quote.source}
              </Typography>
            )}
          </Stack>
          <FormatQuoteIcon
            sx={{ verticalAlign: "text-top", opacity: 0.6, fontSize: 22 }}
          />
        </Stack>
        <Typography variant="body2" color="#1d1c1cff" mt={"30px"}>
          We couldn’t find <code>{pathname}</code>.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
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
      </Stack>
    </Box>
  );
};
