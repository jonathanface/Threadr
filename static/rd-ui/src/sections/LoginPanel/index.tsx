import styles from './loginpanel.module.css';

export const LoginPanel = () => {
  return (
    <div className={styles.loginPanel}
    >
      <h1>Sign In Options</h1>
      <div className={styles.option}>
        <a href="/auth/google" id="LoginWithGoogle">
          <img
            alt="Login with Google"
            src="https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg"
            width="175"
          />
        </a>
      </div>
      <div className={styles.option}>
        <a href="/auth/amazon" id="LoginWithAmazon">
          <img
            alt="Login with Amazon"
            src="https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png"
            width="175"
          />
        </a>
      </div>
      <div className={styles.option}>
        <a href="/auth/microsoftonline" id="LoginWithMicrosoft">
          <img
            alt="Login with Microsoft"
            src="https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_light.png"
            width="175"
          />
        </a>
      </div>
    </div>
  );
};
