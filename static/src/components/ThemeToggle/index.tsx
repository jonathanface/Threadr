import { IconButton } from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { useEffect, useState } from "react";
import styles from "./themetoggle.module.css";

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const preferredTheme = savedTheme || "dark";

    setTheme(preferredTheme);
    document.documentElement.setAttribute("data-theme", preferredTheme);
  }, []);

  const toggleTheme = () => {
    setIsAnimating(true);

    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);

    // Apply theme to document
    document.documentElement.setAttribute("data-theme", newTheme);

    // Save to localStorage
    localStorage.setItem("theme", newTheme);

    // Remove animation class after transition
    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  return (
    <div className={`${styles.themeToggle} ${isAnimating ? styles.animating : ""}`}>
      <IconButton
        onClick={toggleTheme}
        aria-label="toggle theme"
        className={styles.toggleButton}
        sx={{
          color: "#ffffff",
          transition: "all 0.3s ease",
          "&:hover": {
            transform: "scale(1.1) rotate(20deg)",
          },
        }}
      >
        {theme === "dark" ? (
          <LightModeIcon fontSize="medium" />
        ) : (
          <DarkModeIcon fontSize="medium" />
        )}
      </IconButton>
    </div>
  );
};
