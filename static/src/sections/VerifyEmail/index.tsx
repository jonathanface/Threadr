import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import styles from "../LoginPanel/loginpanel.module.css";

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "Missing verification token.");

  useEffect(() => {
    if (!token) {
      return;
    }

    // The verify endpoint redirects to /signin?verified=true on success.
    // If we're on this page, it means the redirect didn't work (e.g., API call from frontend).
    // Try calling the endpoint directly.
    const verify = async () => {
      try {
        await axios.get(`/auth/email/verify?token=${token}`, {
          maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
        });
        setStatus("success");
        setMessage("Email verified successfully!");
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 302) {
          // Redirect means success
          setStatus("success");
          setMessage("Email verified successfully!");
        } else if (axios.isAxiosError(err) && err.response?.data?.error) {
          setStatus("error");
          setMessage(err.response.data.error);
        } else {
          setStatus("error");
          setMessage("Failed to verify email. The link may have expired.");
        }
      }
    };

    verify();
  }, [token]);

  return (
    <div className={styles.loginPanel}>
      <h1>Email Verification</h1>
      {status === "loading" && <p>Verifying your email...</p>}
      {status === "success" && (
        <>
          <p className={styles.successMessage}>{message}</p>
          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Sign In</Link>
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <p className={styles.errorMessage}>{message}</p>
          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Back to Sign In</Link>
          </div>
        </>
      )}
    </div>
  );
};
