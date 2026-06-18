import axios from "axios";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import styles from "../LoginPanel/loginpanel.module.css";
import { usePostHog } from "@posthog/react";

export const SignupPanel = () => {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const fromDemo = searchParams.get("from") === "demo";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!firstName || !lastName || !email || !password) {
      setError("All fields are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!termsAccepted) {
      setError("You must agree to the Terms of Service and Privacy Policy");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post("/auth/email/signup", {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        terms_accepted: termsAccepted,
      });
      posthog?.capture("user_signed_up", { auth_type: "email" });
      setSuccess(res.data.message || "Account created! Check your email to verify.");
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data;
        if (data.error === "account_exists_oauth") {
          setError(`An account with this email already exists using ${data.auth_type}. Please sign in with ${data.auth_type} instead.`);
        } else {
          setError(data.error || data.message || "Failed to create account");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
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
      <h1>Create Account</h1>

      {fromDemo && !success && (
        <p
          className={styles.successMessage}
          style={{ marginBottom: "1rem" }}
        >
          Sign up to keep the draft you started — we'll move it into your account.
        </p>
      )}

      {success ? (
        <div>
          <p className={styles.successMessage}>{success}</p>
          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Go to Sign In</Link>
          </div>
        </div>
      ) : (
        <>
          <form className={styles.emailForm} onSubmit={handleSignup}>
            {error && <p className={styles.errorMessage}>{error}</p>}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={styles.input}
                style={{ flex: 1, minWidth: 0 }}
                autoComplete="given-name"
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={styles.input}
                style={{ flex: 1, minWidth: 0 }}
                autoComplete="family-name"
              />
            </div>
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
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.9rem", marginTop: "0.5rem" }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{ marginTop: "0.2rem", flexShrink: 0 }}
                aria-label="Accept Terms of Service and Privacy Policy"
              />
              <span>
                I agree to the{" "}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className={styles.link}>
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className={styles.link}>
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className={styles.links} style={{ justifyContent: "center" }}>
            <Link to="/signin" className={styles.link}>Already have an account? Sign in</Link>
          </div>
        </>
      )}
    </div>
  );
};
