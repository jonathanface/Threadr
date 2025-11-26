import axios from "axios";
import { logger } from "../utils/logger";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  validateStatus: (status) => {
    // Treat 2xx as OK, plus allow 501 to be handled manually
    return status >= 200 && status < 300;
  },
});

// Example interceptors if you want global auth/error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log all API errors with context
    const errorContext = {
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
    };

    if (error.response?.status === 401) {
      const isRoot = window.location.pathname === "/";
      const isSignin = window.location.pathname.startsWith("/signin");

      logger.warn("API 401 Unauthorized detected", {
        ...errorContext,
        currentPath: window.location.pathname,
        isRoot,
        isSignin,
      });

      if (!isRoot && !isSignin) {
        // get current path + query string (no origin so it's relative)
        const currentPath = window.location.pathname + window.location.search;
        logger.info("Redirecting to signin", {
          from: currentPath,
          redirectUrl: `/signin?next=${encodeURIComponent(currentPath)}`,
        });
        window.location.href = `/signin?next=${encodeURIComponent(currentPath)}`;
        return;
      }
    } else if (error.response?.status) {
      // Log other HTTP errors
      logger.error("API request failed", errorContext);
    } else if (error.request) {
      // Request made but no response received (network error)
      logger.error("API network error - no response received", {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        message: error.message,
      });
    } else {
      // Error in request setup
      logger.error("API request setup error", {
        message: error.message,
      });
    }

    return Promise.reject(error);
  },
);
