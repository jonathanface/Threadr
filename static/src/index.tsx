import ReactDOM from "react-dom/client";
import { Docter } from "./docter";
import { Loader } from "./utils/Loader";
import { Toaster } from "./utils/Toaster";
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoaderProvider } from "./providers/loader";
import { UserProvider } from "./providers/user";
import { SelectionsProvider } from "./providers/selections";
import { WorksListProvider } from "./providers/worksList";
import { AlertProvider } from "./providers/alert";
import { AuthProvider } from "react-oidc-context";
import { AuthRunner } from "./components/AuthRunner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useMemo, useState, useEffect } from "react";


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
    <ThemeProvider theme={theme}>
      <ErrorBoundary>
        <BrowserRouter>
          <LoaderProvider>
            <AlertProvider>
              <UserProvider>
                <SelectionsProvider>
                  <WorksListProvider>
                    <Toaster />
                    <Loader />
                    <Docter />
                  </WorksListProvider>
                </SelectionsProvider>
              </UserProvider>
            </AlertProvider>
          </LoaderProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

const content = mode === 'staging' ? (
  <AuthProvider {...cognitoAuthConfig}>
    <AuthRunner><AppWithTheme /></AuthRunner>
  </AuthProvider>
) : (<AppWithTheme />);


root.render(content);
