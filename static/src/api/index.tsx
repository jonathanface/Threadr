import axios from "axios";
import { logger } from "../utils/logger";

// Active-request tracking for save spinner
let _activeRequests = 0;
let _isSaving = false;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<() => void>();
const MIN_DISPLAY_MS = 1000;

const notifyListeners = () => _listeners.forEach((fn) => fn());

const onRequestStart = () => {
  _activeRequests++;
  if (!_isSaving) {
    if (_hideTimer) {
      clearTimeout(_hideTimer);
      _hideTimer = null;
    }
    _isSaving = true;
    notifyListeners();
  }
};

const onRequestEnd = () => {
  _activeRequests = Math.max(0, _activeRequests - 1);
  if (_activeRequests === 0 && _isSaving) {
    // Keep spinner visible for at least MIN_DISPLAY_MS
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      _hideTimer = null;
      if (_activeRequests === 0) {
        _isSaving = false;
        notifyListeners();
      }
    }, MIN_DISPLAY_MS);
  }
};

export const subscribeSaving = (fn: () => void) => {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
};
export const getIsSaving = () => _isSaving;

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  validateStatus: (status) => {
    // Treat 2xx as OK, plus allow 501 to be handled manually
    return status >= 200 && status < 300;
  },
});

// Track active requests for save spinner
api.interceptors.request.use(
  (config) => { onRequestStart(); return config; },
  (error) => { onRequestStart(); return Promise.reject(error); },
);

// Example interceptors if you want global auth/error handling
api.interceptors.response.use(
  (response) => { onRequestEnd(); return response; },
  (error) => {
    onRequestEnd();
    // Log all API errors with context
    const errorContext = {
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
    };

    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const isPublicPage =
        path === "/" ||
        path.startsWith("/signin") ||
        path.startsWith("/signup") ||
        path.startsWith("/shared/") ||
        path.startsWith("/verify-email") ||
        path.startsWith("/forgot-password") ||
        path.startsWith("/reset-password") ||
        path.startsWith("/link-account");

      logger.warn("API 401 Unauthorized detected", {
        ...errorContext,
        currentPath: path,
        isPublicPage,
      });

      if (!isPublicPage) {
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
