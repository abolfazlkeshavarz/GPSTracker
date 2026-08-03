// Small helpers for reading the stored JWT. Kept free of imports from the
// auth store so the axios interceptor can use them without a circular import.

export const TOKEN_KEY = "token";
export const USER_KEY = "user";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

interface JwtPayload {
  exp?: number;
  user_id?: number;
}

/**
 * Decodes a JWT payload without verifying it.
 *
 * The signature is only meaningful to the server; the client reads `exp` purely
 * so it can drop an obviously dead token instead of rendering a broken session.
 * Never trust anything in here for an authorisation decision.
 */
export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    // base64url -> base64, then decode as UTF-8.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((ch) => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );

    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
};

/** Returns true when the token is missing, malformed, or past its exp claim. */
export const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;

  const payload = decodeToken(token);
  if (!payload?.exp) return true;

  // Small skew allowance so a token about to expire is not treated as live.
  return payload.exp * 1000 <= Date.now() + 5000;
};

/** Milliseconds until the token expires, or 0 if it already has. */
export const millisUntilExpiry = (token: string | null): number => {
  if (!token) return 0;

  const payload = decodeToken(token);
  if (!payload?.exp) return 0;

  return Math.max(0, payload.exp * 1000 - Date.now());
};
