import axios from "axios";

export const sharedApi = axios.create({
  baseURL: "/api/v1/shared",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
