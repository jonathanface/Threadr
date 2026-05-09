import type { ReactNode } from "react";
import { useAuth } from "react-oidc-context";

interface AuthRunnerProps {
  children?: ReactNode;
}

const PUBLIC_PATH_PREFIXES = ["/try", "/shared/"];

const isPublicPath = (pathname: string | undefined): boolean => {
  if (!pathname) return false;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
};

export const AuthRunner = ({ children }: AuthRunnerProps) => {
  const auth = useAuth();

  const signOutRedirect = () => {
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI;
    const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (isPublicPath(window.location.pathname)) {
    return <>{children}</>;
  }

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  if (auth.isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div>
      <button type="button" onClick={() => auth.signinRedirect()}>
        Sign in
      </button>
      <button type="button" onClick={() => signOutRedirect()}>
        Sign out
      </button>
    </div>
  );
};
