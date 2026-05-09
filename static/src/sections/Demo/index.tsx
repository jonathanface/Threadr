import { Alert, Box, Snackbar, Stack, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../contexts/user";
import { TryWriter } from "./TryWriter";
import { DEMO_PENDING_CONVERSION_KEY, readDraft } from "./storage";
import type { DemoDraft } from "./types";

export const DemoPage = () => {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const userContext = useContext(UserContext);

  const [title, setTitle] = useState<string>(() => {
    const existing = readDraft();
    return existing?.title ?? "";
  });

  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  const latestSnapshotRef = useRef<DemoDraft | null>(readDraft());

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    scrollToTop();
    // Run again after the next paint in case TryWriter's mount changes layout.
    const raf = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (sessionStorage.getItem("demo_started_fired") !== "true") {
      posthog?.capture("demo_started");
      sessionStorage.setItem("demo_started_fired", "true");
    }
  }, [posthog]);

  const reportSnapshot = useCallback((snapshot: DemoDraft) => {
    latestSnapshotRef.current = snapshot;
  }, []);

  const handleWarning = useCallback((message: string) => {
    setWarningMessage(message);
  }, []);

  const handleSave = () => {
    const snapshot = latestSnapshotRef.current ?? readDraft();
    const characterCount = snapshot
      ? JSON.parse(snapshot.lexical_state).root.children.reduce(
          (acc: number, child: { children?: { text?: string }[] }) =>
            acc +
            (child.children?.reduce(
              (sum, c) => sum + (c.text?.length ?? 0),
              0,
            ) ?? 0),
          0,
        )
      : 0;

    posthog?.capture("demo_save_clicked", {
      has_associations: (snapshot?.associations.length ?? 0) > 0,
      associations_count: snapshot?.associations.length ?? 0,
      character_count: characterCount,
      title_set: Boolean(snapshot?.title?.trim()),
    });

    localStorage.setItem(DEMO_PENDING_CONVERSION_KEY, "true");

    if (userContext?.isLoggedIn) {
      navigate("/import-draft");
    } else {
      navigate("/signup?from=demo");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        // The global HeaderMenu is hidden on /try, so the editor toolbar
        // sticks at the very top of the viewport once the banner above it
        // scrolls away.
        ["--toolbar-sticky-top" as string]: "0px",
      } as React.CSSProperties}
    >
      <Box
        component="section"
        aria-label="Try Threadr trial banner"
        sx={{
          position: "relative",
          flexShrink: 0,
          width: "100%",
          boxSizing: "border-box",
          px: { xs: 2.5, md: 5 },
          py: { xs: 3, md: 4 },
          mb: { xs: 2, md: 3 },
          backgroundColor: "var(--bg-primary)",
          // Subtle accent wash blooming from the right where the CTA lives
          backgroundImage:
            "radial-gradient(ellipse 600px 200px at 100% 50%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 70%)",
          // Hairline divider as a real bottom border so it never collapses
          borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.08))",
          // Brand-coloured underscore that visually bridges header → editor
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent 0%, var(--primary) 18%, var(--primary) 82%, transparent 100%)",
            opacity: 0.55,
            pointerEvents: "none",
          },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 3 }}
          alignItems={{ xs: "stretch", sm: "flex-start" }}
          justifyContent="space-between"
          sx={{ position: "relative", zIndex: 1, textAlign: "left" }}
        >
          <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
            {/* Heading */}
            <Typography
              component="h1"
              sx={{
                m: 0,
                fontFamily: '"Fraunces", Georgia, serif',
                fontWeight: 600,
                fontSize: { xs: "1.5rem", md: "1.75rem" },
                lineHeight: 1.1,
                letterSpacing: "-0.015em",
                color: "var(--text-primary)",
              }}
            >
              Try{" "}
              <Box
                component="span"
                sx={{
                  fontStyle: "italic",
                  fontWeight: 700,
                  color: "var(--primary)",
                }}
              >
                Threadr
              </Box>
            </Typography>

            {/* Eyebrow */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                color: "var(--primary)",
                fontFamily: '"Outfit", system-ui, sans-serif',
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "var(--primary)",
                  boxShadow:
                    "0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)",
                  flexShrink: 0,
                }}
              />
              <span>Draft Mode · Saved in this browser</span>
            </Stack>

            {/* Body */}
            <Typography
              component="p"
              sx={{
                m: 0,
                fontFamily: '"Outfit", system-ui, sans-serif',
                fontSize: "0.8125rem",
                lineHeight: 1.5,
                color: "var(--text-secondary)",
              }}
            >
              Write a scene. Highlight a name and right-click to mark a
              character, place, or event. Your draft is saved in this browser —
              sign up to keep it forever.
            </Typography>
          </Stack>

        </Stack>
      </Box>

      <div style={{ flex: 1, minHeight: 0 }}>
        <TryWriter
          title={title}
          onTitleChange={setTitle}
          onWarning={handleWarning}
          onSaveClick={handleSave}
          onBackClick={() => navigate("/")}
          reportSnapshot={reportSnapshot}
        />
      </div>

      <Snackbar
        open={warningMessage !== null}
        autoHideDuration={6000}
        onClose={() => setWarningMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setWarningMessage(null)}
        >
          {warningMessage}
        </Alert>
      </Snackbar>
    </div>
  );
};

