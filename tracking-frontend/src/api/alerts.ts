import api from "./axios";

/**
 * Every rule the alert engine can fire.
 *
 * Kept as a closed union so a new backend kind shows up as a TypeScript error
 * in the icon/tone maps rather than as a blank row in the UI.
 */
export type AlertKind =
  | "geofence_enter"
  | "geofence_exit"
  | "low_battery"
  | "offline"
  | "back_online"
  | "overspeed"
  | "ignition_on"
  | "ignition_off"
  | "tow"
  | "impact"
  | "harsh_accel"
  | "harsh_brake"
  | "harsh_corner"
  | "power_cut"
  | "power_restored"
  | "jamming"
  | "sos"
  | "subscription_expiring"
  | "subscription_expired";

/** How loudly a client should present the alert. Derived server-side. */
export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: number;
  device_serial: string;
  kind: AlertKind;
  severity: AlertSeverity;
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

export const listAlerts = async (options?: {
  unreadOnly?: boolean;
  limit?: number;
  severity?: AlertSeverity;
}): Promise<AlertsResponse> => {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.append("unread", "1");
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.severity) params.append("severity", options.severity);
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
