import axios from "axios";

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
    if (error.response?.status === 401) {
      const isRoot = window.location.pathname === "/";
      const isSignin = window.location.pathname.startsWith("/signin");

      if (!isRoot && !isSignin) {
        // get current path + query string (no origin so it's relative)
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/signin?next=${encodeURIComponent(currentPath)}`;
        return;
      }
    }
    return Promise.reject(error);
  },
);
