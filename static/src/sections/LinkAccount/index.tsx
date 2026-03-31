import axios from "axios";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "../LoginPanel/loginpanel.module.css";

export const LinkAccountPage = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const provider = searchParams.get("provider") || "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!email || !provider) {
    return (
      <div className={styles.loginPanel}>
        <h1>Link Account</h1>
        <p className={styles.errorMessage}>Invalid link. Please try signing in again.</p>
        <div className={styles.links} style={{ justifyContent: "center" }}>
          <Link to="/signin" className={styles.link}>Back to Sign In</Link>
        </div>
      </div>
    );
  }

  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("Password is required to confirm linking");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/auth/email/link-oauth", {
        email,
        password,
        provider,
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to link account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.loginPanel}>
        <h1>Account Linked</h1>
        <p className={styles.successMessage}>
          Your account has been linked to {providerLabel}. From now on, sign in with {providerLabel}.
        </p>
        <div className={styles.links} style={{ justifyContent: "center" }}>
          <a href={`/auth/${provider}`} className={styles.link}>Sign in with {providerLabel}</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginPanel}>
      <h1>Link Your Account</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        An account with <strong>{email}</strong> already exists using email/password.
        Would you like to link it to {providerLabel}?
      </p>
      <p style={{ color: "var(--text-tertiary)", marginBottom: "1.5rem", fontSize: "0.8rem" }}>
        After linking, you'll sign in with {providerLabel} instead of a password.
      </p>

      <form className={styles.emailForm} onSubmit={handleLink}>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <input
          type="password"
          placeholder="Enter your current password to confirm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          autoComplete="current-password"
        />
        <button type="submit" className={styles.submitButton} disabled={loading}>
          {loading ? "Linking..." : `Link to ${providerLabel}`}
        </button>
      </form>

      <div className={styles.links}>
        <Link to="/signin" className={styles.link}>Cancel, sign in with email instead</Link>
      </div>
    </div>
  );
};
