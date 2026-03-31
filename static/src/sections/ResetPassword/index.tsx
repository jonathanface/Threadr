import axios from "axios";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "../LoginPanel/loginpanel.module.css";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className={styles.loginPanel}>
        <h1>Reset Password</h1>
        <p className={styles.errorMessage}>Missing reset token. Please use the link from your email.</p>
        <div className={styles.links} style={{ justifyContent: "center" }}>
          <Link to="/forgot-password" className={styles.link}>Request a new reset link</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/auth/email/reset-password", {
        token,
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to reset password. The link may have expired.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.loginPanel}>
        <h1>Password Reset</h1>
        <p className={styles.successMessage}>
          Your password has been reset successfully!
        </p>
        <div className={styles.links} style={{ justifyContent: "center" }}>
          <Link to="/signin?reset=true" className={styles.link}>Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginPanel}>
      <h1>Set New Password</h1>
      <form className={styles.emailForm} onSubmit={handleSubmit}>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <input
          type="password"
          placeholder="New Password (min 8 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={styles.input}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={styles.input}
          autoComplete="new-password"
        />
        <button type="submit" className={styles.submitButton} disabled={loading}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>
    </div>
  );
};
