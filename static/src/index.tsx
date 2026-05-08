import ReactDOM from "react-dom/client";
import { Threadr } from "./threadr";
import { Loader } from "./utils/Loader";
import { Toaster } from "./utils/Toaster";
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoaderProvider } from "./providers/loader";
import { UserProvider } from "./providers/user";
import { SelectionsProvider } from "./providers/selections";
import { WorksListProvider } from "./providers/worksList";
import { NotificationsProvider } from "./providers/notifications";
import { AlertProvider } from "./providers/alert";
import { AuthProvider } from "react-oidc-context";
import { AuthRunner } from "./components/AuthRunner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useMemo, useState, useEffect } from "react";
import { initFaviconSpinner } from "./utils/faviconSpinner";
import posthog from "posthog-js";
import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const isProductionDeploy = import.meta.env.VITE_MODE === "production";
if (isProductionDeploy && posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-01-30",
  });
} else if (!isProductionDeploy) {
  console.info("PostHog disabled outside production deploys");
} else {
  console.warn("PostHog token/host missing — analytics disabled");
}

initFaviconSpinner();


const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

const mode = import.meta.env.VITE_MODE;

const cognitoAuthConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  response_type: "code",
  scope: "email",
};

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#d97706", dark: "#b45309", contrastText: "#fff" },
    secondary: { main: "#78716c" },
    background: { default: "#1c1917", paper: "#292524" },
    text: { primary: "#fafaf9", secondary: "#d6d3d1" },
    divider: "rgba(255,255,255,0.08)",
  },
});

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0e7c5f", dark: "#065f46", contrastText: "#fff" },
    secondary: { main: "#6b8db5" },
    background: { default: "#f0f7ff", paper: "#ffffff" },
    text: { primary: "#0d2847", secondary: "#3d6490" },
    divider: "rgba(14,124,95,0.1)",
  },
});

// eslint-disable-next-line react-refresh/only-export-components
const AppWithTheme = () => {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-theme") !== "light"
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.getAttribute("data-theme") !== "light"
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  return (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>
        <ThemeProvider theme={theme}>
          <ErrorBoundary>
            <BrowserRouter>
              <LoaderProvider>
                <AlertProvider>
                  <UserProvider>
                    <NotificationsProvider>
                      <SelectionsProvider>
                        <WorksListProvider>
                          <Toaster />
                          <Loader />
                          <Threadr />
                        </WorksListProvider>
                      </SelectionsProvider>
                    </NotificationsProvider>
                  </UserProvider>
                </AlertProvider>
              </LoaderProvider>
            </BrowserRouter>
          </ErrorBoundary>
        </ThemeProvider>
      </PostHogErrorBoundary>
    </PostHogProvider>
  );
};

const content = mode === 'staging' ? (
  <AuthProvider {...cognitoAuthConfig}>
    <AuthRunner><AppWithTheme /></AuthRunner>
  </AuthProvider>
) : (<AppWithTheme />);


root.render(content);
