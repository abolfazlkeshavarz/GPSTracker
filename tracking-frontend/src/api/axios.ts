import axios from "axios";
import { clearSession, getToken, isTokenExpired } from "../lib/token";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Without this, an expired or revoked token left the app stuck: every request
// failed with 401, the dead token stayed in localStorage, and the router still
// treated the user as signed in.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      clearSession();

      // Full reload so every store and in-flight hook resets cleanly.
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  }
);

export { isTokenExpired };
export default api;
