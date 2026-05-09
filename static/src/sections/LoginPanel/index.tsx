import axios from "axios";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePostHog } from "@posthog/react";
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
      await axios.post("/auth/email/login", { email, password }, { withCredentials: true });
      posthog?.capture("user_logged_in", { auth_type: "email" });
      window.location.href = "/stories";
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data;
        if (data.error === "oauth_account") {
          setError(`This account uses ${data.auth_type} sign-in. Please use the ${data.auth_type} button above.`);
        } else if (data.error === "email_not_verified") {
          setError("Please verify your email before signing in. Check your inbox for the verification link.");
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
        setResendMessage("Please wait a moment before requesting another email.");
      } else {
        setResendMessage("Couldn't send the verification email. Please try again later.");
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
          Password reset successfully! You can now sign in with your new password.
        </p>
      )}

      <div className={styles.oauthSection}>
        <div className={styles.option}>
          <a href={`/auth/google${search}`} id="LoginWithGoogle">
            <img
              alt="Login with Google"
              src="https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg"
              width="175"
            />
          </a>
        </div>
        <div className={styles.option}>
          <a href={`/auth/amazon${search}`} id="LoginWithAmazon">
            <img
              alt="Login with Amazon"
              src="https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png"
              width="175"
            />
          </a>
        </div>
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
        <button type="submit" className={styles.submitButton} disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className={styles.links}>
        <Link to="/forgot-password" className={styles.link}>Forgot password?</Link>
        <Link to="/signup" className={styles.link}>Create an account</Link>
      </div>
    </div>
  );
};
