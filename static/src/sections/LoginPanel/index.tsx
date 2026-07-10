import { usePostHog } from "@posthog/react";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import styles from "./loginpanel.module.css";

export const LoginPanel = () => {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const search = window.location.search;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const verified = searchParams.get("verified") === "true";
  const reset = searchParams.get("reset") === "true";

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setResendMessage("");
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        "/auth/email/login",
        { email, password },
        { withCredentials: true },
      );
      posthog?.capture("user_logged_in", { auth_type: "email" });
      window.location.href = "/stories";
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data;
        if (data.error === "oauth_account") {
          setError(
            `This account uses ${data.auth_type} sign-in. Please use the ${data.auth_type} button above.`,
          );
        } else if (data.error === "email_not_verified") {
          setError(
            "Please verify your email before signing in. Check your inbox for the verification link.",
          );
          setShowResend(true);
        } else {
          setError(data.error || data.message || "Invalid email or password");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setResendMessage("");
    try {
      const res = await axios.post(
        "/auth/email/resend-verification",
        { email },
        { withCredentials: true },
      );
      setResendMessage(
        res.data?.message ||
          "If that email needs verification, a new link has been sent.",
      );
      setShowResend(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setResendMessage(
          "Please wait a moment before requesting another email.",
        );
      } else {
        setResendMessage(
          "Couldn't send the verification email. Please try again later.",
        );
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={styles.loginPanel}>
      <button
        className={styles.closeButton}
        onClick={handleBack}
        aria-label="Go back"
      >
        &times;
      </button>
      <h1>Sign In</h1>

      {verified && (
        <p className={styles.successMessage}>
          Email verified successfully! You can now sign in.
        </p>
      )}
      {reset && (
        <p className={styles.successMessage}>
          Password reset successfully! You can now sign in with your new
          password.
        </p>
      )}

      <div className={styles.oauthSection}>
        <div className={styles.option}>
          <a
            href={`/auth/google${search}`}
            id="LoginWithGoogle"
            className={styles.googleButton}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Sign in with Google
          </a>
        </div>
        <div className={styles.option}>
          <a
            href={`/auth/amazon${search}`}
            id="LoginWithAmazon"
            className={styles.amazonButton}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 1 L3 16 M12 1 L21 16 M7 11 L17 11"
              />
              <path
                fill="none"
                stroke="#ff9900"
                strokeWidth="2"
                strokeLinecap="round"
                d="M3 19 Q12 23.5 21 19"
              />
              <path fill="#ff9900" d="M19.5 17.5 L21.5 19 L19.5 20.5 Z" />
            </svg>
            Sign in with Amazon
          </a>
        </div>
        <p
          style={{
            fontSize: "0.8rem",
            opacity: 0.75,
            textAlign: "center",
            marginTop: "0.5rem",
          }}
        >
          By continuing, you agree to our{" "}
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <div className={styles.divider}>
        <span>or sign in with email</span>
      </div>

      <form className={styles.emailForm} onSubmit={handleEmailLogin}>
        {error && <p className={styles.errorMessage}>{error}</p>}
        {showResend && (
          <button
            type="button"
            className={styles.link}
            onClick={handleResendVerification}
            disabled={resending}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: resending ? "default" : "pointer",
              textAlign: "left",
              marginBottom: "0.5rem",
            }}
          >
            {resending ? "Sending..." : "Resend verification email"}
          </button>
        )}
        {resendMessage && (
          <p className={styles.successMessage}>{resendMessage}</p>
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          autoComplete="current-password"
        />
        <button
          type="submit"
          className={styles.submitButton}
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className={styles.links}>
        <Link to="/forgot-password" className={styles.link}>
          Forgot password?
        </Link>
        <Link to="/signup" className={styles.link}>
          Create an account
        </Link>
      </div>
    </div>
  );
};
