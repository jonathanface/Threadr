import { useNavigate } from "react-router-dom";
import styles from "./loginpanel.module.css";

export const LoginPanel = () => {
  const navigate = useNavigate();
  const search = window.location.search;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
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
      <h1>Sign In Options</h1>
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
  );
};
