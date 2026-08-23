import api from "./axios";

export type AlertKind = "geofence_enter" | "geofence_exit" | "low_battery" | "offline" | "back_online";

export interface Alert {
  id: number;
  device_serial: string;
  kind: AlertKind;
  title: string;
  detail?: string;
  lat?: number;
  lng?: number;
  geofence_id?: number;
  is_read: boolean;
  created_at: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  unread_count: number;
}

export const listAlerts = async (options?: { unreadOnly?: boolean; limit?: number }): Promise<AlertsResponse> => {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.append("unread", "1");
  if (options?.limit) params.append("limit", String(options.limit));
  const qs = params.toString();
  const response = await api.get(`/alerts${qs ? `?${qs}` : ""}`);
  return response.data;
};

export const markAlertRead = async (id: number) => {
  const response = await api.post(`/alerts/${id}/read`);
  return response.data;
};

export const markAllAlertsRead = async () => {
  const response = await api.post("/alerts/read-all");
  return response.data;
};
