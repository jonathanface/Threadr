import { useState, useEffect } from "react";
import { useMediaQuery } from "@mui/material";
import styles from "./mobileAppBanner.module.css";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=io.docter.mobile";
const STORAGE_KEY = "mobileAppBannerDismissed";

// Google Play icon SVG
const PlayStoreIcon = () => (
  <svg
    viewBox="0 0 512 512"
    className={styles.icon}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
  </svg>
);

// Close icon SVG
const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

export const MobileAppBanner = () => {
  const isMobile = useMediaQuery("(max-width: 600px)");
  const [dismissed, setDismissed] = useState(true); // Default to hidden to prevent flash

  useEffect(() => {
    // Check localStorage on mount
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  // Only show on mobile devices and if not dismissed
  if (!isMobile || dismissed) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.content}
      >
        <PlayStoreIcon />
        <div className={styles.text}>
          <span className={styles.title}>Get the Docter app</span>
          <span className={styles.subtitle}>Download on Google Play</span>
        </div>
      </a>
      <button
        onClick={handleDismiss}
        className={styles.closeButton}
        aria-label="Dismiss banner"
      >
        <CloseIcon />
      </button>
    </div>
  );
};
