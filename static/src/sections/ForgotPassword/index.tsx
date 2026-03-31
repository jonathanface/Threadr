import axios from "axios";
import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../LoginPanel/loginpanel.module.css";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/auth/email/request-reset", { email });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // Always show success to prevent enumeration
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginPanel}>
      <h1>Reset Password</h1>

      {submitted ? (
        <>
          <p className={styles.successMessage}>
            If an account with that email exists, we've sent a password reset link.
            Please check your inbox.
          </p>
          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Back to Sign In</Link>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Enter your email address and we'll send you a link to reset your password.
          </p>
          <form className={styles.emailForm} onSubmit={handleSubmit}>
            {error && <p className={styles.errorMessage}>{error}</p>}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              autoComplete="email"
            />
            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Back to Sign In</Link>
          </div>
        </>
      )}
    </div>
  );
};
