import { ReactNode } from "react";
import { useAuth } from "react-oidc-context";

interface AuthRunnerProps {
    children?: ReactNode;
}

export const AuthRunner = ({ children }: AuthRunnerProps) => {

    const auth = useAuth();

    const signOutRedirect = () => {
        const clientId = "3767p133npflnb4c9r0p3tlasb";
        const logoutUri = "https://rich.docter.io";
        const cognitoDomain = "https://us-east-1z7a7yvnuo.auth.us-east-1.amazoncognito.com";
        window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    };

    if (auth.isLoading) {
        return <div>Loading...</div>;
    }

    if (auth.error) {
        return <div>Encountering error... {auth.error.message}</div>;
    }

    if (auth.isAuthenticated) {
        if (auth.isAuthenticated) {
            return <>{children}</>;
        }
    }

    return (
        <div>
            <button onClick={() => auth.signinRedirect()}>Sign in</button>
            <button onClick={() => signOutRedirect()}>Sign out</button>
        </div>
    );
};