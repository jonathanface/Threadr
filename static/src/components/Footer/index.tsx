import { Tooltip } from "@mui/material";
import styles from "./footer.module.css";
export const Footer = () => {
  const version = import.meta.env.VITE_APP_VERSION;
  const thisYear = new Date().getFullYear();
  return (
    <footer>
      <p>©{thisYear} Docter.io, All Rights Reserved</p>
      <p>
        <a href="/privacy.html">Privacy Policy</a>&nbsp;&nbsp;&nbsp;
        <a href="/terms.html">Terms of Use</a>
      </p>
      <div className={styles.version}>
        <Tooltip title={version}>
          <span>version</span>
        </Tooltip>
      </div>
    </footer>
  );
};
