import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { Badge, IconButton } from "@mui/material";
import { useNotifications } from "../../hooks/useNotifications";
import { UserAlert } from "../../types/Alert";
import styles from "./notificationsbell.module.css";

const formatRelativeTime = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(diff / 86400);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
};

export const NotificationsBell = () => {
  const { alerts, unreadCount, markAsRead } = useNotifications();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const sortedAlerts = [...alerts].sort(
    (a, b) => b.created_at - a.created_at
  );

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleDismiss = async (e: React.MouseEvent, alert: UserAlert) => {
    e.stopPropagation();
    if (!alert.read) {
      await markAsRead(alert.alert_id);
    }
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, handleClickOutside]);

  return (
    <span
      className={styles.bellContainer}
      ref={containerRef}
    >
      <IconButton
        onClick={handleToggle}
        sx={{
          color: "#ffffff",
          "&:hover": { transform: "scale(1.1)" },
          transition: "all 0.3s ease",
        }}
        aria-label="notifications"
      >
        <Badge
          badgeContent={unreadCount}
          color="error"
          max={99}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: "0.65rem",
              minWidth: 16,
              height: 16,
            },
          }}
        >
          <NotificationsIcon fontSize="medium" />
        </Badge>
      </IconButton>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span>Notifications</span>
            <IconButton
              size="small"
              onClick={() => setIsOpen(false)}
              sx={{ color: "var(--text-secondary)", padding: "2px" }}
              aria-label="close notifications"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
          {sortedAlerts.length === 0 ? (
            <div className={styles.emptyState}>No notifications</div>
          ) : (
            sortedAlerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`${styles.alertItem} ${
                  alert.read ? styles.alertItemRead : ""
                } ${alert.link ? styles.alertClickable : ""}`}
                onClick={() => {
                  if (alert.link) {
                    if (!alert.read) {
                      markAsRead(alert.alert_id);
                    }
                    navigate(alert.link);
                    setIsOpen(false);
                  }
                }}
              >
                <div className={styles.alertContent}>
                  <div className={styles.alertHeader}>
                    <p className={styles.alertSubject}>{alert.subject}</p>
                    <span className={styles.alertTime}>
                      {formatRelativeTime(alert.created_at)}
                    </span>
                  </div>
                  <p className={styles.alertMessage}>{alert.message}</p>
                </div>
                {!alert.read && (
                  <button
                    className={styles.dismissButton}
                    onClick={(e) => handleDismiss(e, alert)}
                    aria-label="Mark as read"
                  >
                    <CheckIcon sx={{ fontSize: 16 }} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
};
