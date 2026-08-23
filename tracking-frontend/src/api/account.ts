import api from "./axios";

export interface Me {
  id: number;
  phone: string;
  role: string;
  created_at: string;
}

/** Re-syncs the cached user object — e.g. after an admin changes a role. */
export const getMe = async (): Promise<Me> => {
  const response = await api.get("/me");
  return response.data;
};

export const changeMyPassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.put("/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
};

/** Sets a human-readable name for a device — "Dad's Car" instead of a serial. */
export const renameDevice = async (serial: string, name: string) => {
  const response = await api.put(`/devices/${serial}/name`, { name });
  return response.data;
};

/**
 * Downloads a device's location history as CSV and saves it through the
 * browser.
 *
 * The endpoint sits behind AuthMiddleware, which only reads the token from
 * the `Authorization` header — a plain `<a href download>` would hit it with
 * no credentials and 401. Fetching through the authenticated axios instance
 * and handing the browser a Blob URL gets the same "save a file" UX while
 * actually carrying the session token.
 */
export const downloadHistoryCSV = async (serial: string, from?: string, to?: string): Promise<void> => {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const qs = params.toString();

  const response = await api.get(`/devices/${serial}/export.csv${qs ? `?${qs}` : ""}`, {
    responseType: "blob",
  });

  const disposition: string = response.headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `${serial}-history.csv`;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
