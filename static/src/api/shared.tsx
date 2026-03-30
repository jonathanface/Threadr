import axios from "axios";

export const sharedApi = axios.create({
  baseURL: "/api/v1/shared",
  withCredentials: false,
  headers: {
    "Content-Type": "application/json",
  },
});
