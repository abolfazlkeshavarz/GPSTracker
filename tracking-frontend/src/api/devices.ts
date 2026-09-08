import api from "./axios";

export const getDevices = async () => {
  const response = await api.get("/devices");
  return response.data;
};

export const getLatestLocation = async (serial: string) => {
  const response = await api.get(`/devices/${serial}/latest`);
  return response.data;
};

export const getDeviceStatus = async (serial: string) => {
  const response = await api.get(`/devices/${serial}/status`);
  return response.data;
};

export const getSignal = async (serial: string) => {
  const response = await api.get(`/devices/${serial}/signal`);
  return response.data;
};

export interface Odometer {
  device: string;
  total_meters: number;
  total_km: number;
  updated_at?: string;
}

/** Lifetime distance total for a device, accumulated server-side on ingest. */
export const getOdometer = async (serial: string): Promise<Odometer> => {
  const response = await api.get(`/devices/${serial}/odometer`);
  return response.data;
};

/** Overwrites the odometer reading, e.g. to match the vehicle dashboard or reset to 0. */
export const setOdometer = async (serial: string, totalKm: number): Promise<Odometer> => {
  const response = await api.put(`/devices/${serial}/odometer`, { total_km: totalKm });
  return response.data;
};

export const getHistory = async (serial: string, limit?: number, hours?: number) => {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  if (hours) params.append("hours", hours.toString());
  
  const response = await api.get(`/devices/${serial}/history?${params.toString()}`);
  return response.data;
};

export interface TrackPoint {
  lat: number;
  lng: number;
  speed: number;
  satellites: number;
  csq: number;
  battery: number;
  ignition?: boolean;
  heading?: number;
  /** True when the point was buffered through a coverage gap and replayed. */
  is_backfill?: boolean;
  recorded_at: string;
}

export interface ChainVerification {
  valid: boolean;
  record_count: number;
  hmac_count: number;
  legacy_count: number;
  backfill_count: number;
  unprotected_count: number;
  head_hash: string;
  first_broken_id?: number;
  detail?: string;
  checked_at: string;
}

export interface VerifyResponse {
  device: string;
  from: string;
  to: string;
  verification: ChainVerification;
  anchored_to_start: boolean;
  note: string;
}

export interface TrackStop {
  lat: number;
  lng: number;
  arrived_at: string;
  departed_at: string;
  duration_seconds: number;
  duration: string;
  point_count: number;
}

export interface TrackSummary {
  distance_km: number;
  point_count: number;
  stop_count: number;
  max_speed: number;
  avg_moving_speed: number;
  total_seconds: number;
  moving_seconds: number;
  stopped_seconds: number;
  total_duration: string;
  moving_duration: string;
  stopped_duration: string;
  first_recorded_at?: string;
  last_recorded_at?: string;
}

export interface TrackResponse {
  device: string;
  from: string;
  to: string;
  points: TrackPoint[];
  stops: TrackStop[];
  summary: TrackSummary;
  truncated: boolean;
}

/**
 * Movement history for a date range, with stops detected server-side.
 *
 * `from` and `to` accept YYYY-MM-DD or a full RFC3339 timestamp. A bare `to`
 * date covers the whole of that day.
 */
export const getTrack = async (
  serial: string,
  from: string,
  to: string,
  options?: { minStopSeconds?: number; stopRadiusMeters?: number }
): Promise<TrackResponse> => {
  const params = new URLSearchParams({ from, to });

  if (options?.minStopSeconds) {
    params.append("min_stop", String(options.minStopSeconds));
  }
  if (options?.stopRadiusMeters) {
    params.append("stop_radius", String(options.stopRadiusMeters));
  }

  const response = await api.get(`/devices/${serial}/track?${params.toString()}`);
  return response.data;
};

/** Replays the tamper-evident hash chain for a date range. */
export const verifyChain = async (
  serial: string,
  from: string,
  to: string
): Promise<VerifyResponse> => {
  const params = new URLSearchParams({ from, to });
  const response = await api.get(`/devices/${serial}/verify?${params.toString()}`);
  return response.data;
};

/**
 * Downloads the signed trip certificate and saves it through the browser.
 *
 * The endpoint sits behind AuthMiddleware, which only reads the token from
 * the `Authorization` header — a plain `<a href download>` hits it with no
 * credentials and gets a 401 (which is what "File wasn't available on site"
 * in the browser's download manager actually means here). Fetching through
 * the authenticated axios instance and handing the browser a Blob URL gets
 * the same "save a file" UX while actually carrying the session token —
 * the same pattern used for CSV export in api/account.ts.
 */
export const downloadCertificate = async (serial: string, from: string, to: string): Promise<void> => {
  const params = new URLSearchParams({ from, to, download: "1" });

  const response = await api.get(`/devices/${serial}/certificate?${params.toString()}`, {
    responseType: "blob",
  });

  const disposition: string = response.headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `certificate-${serial}.json`;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/* ------------------------------------------------------------- settings */

export interface DeviceSettings {
  device_serial: string;
  /** 0 disables the overspeed rule rather than meaning a limit of 0 km/h. */
  speed_limit_kmh: number;
  report_interval_s: number;
  alert_overspeed: boolean;
  alert_ignition: boolean;
  alert_tow: boolean;
  alert_impact: boolean;
  alert_harsh_driving: boolean;
  alert_power_cut: boolean;
  alert_jamming: boolean;
  alert_low_battery: boolean;
  alert_geofence: boolean;
  alert_offline: boolean;
  silent_mode: boolean;
  updated_at?: string;
}

export const getDeviceSettings = async (serial: string): Promise<DeviceSettings> => {
  const response = await api.get(`/devices/${serial}/settings`);
  return response.data;
};

/** Patch: omitted fields are left as they are. */
export const updateDeviceSettings = async (
  serial: string,
  patch: Partial<Omit<DeviceSettings, "device_serial" | "updated_at">>
): Promise<DeviceSettings> => {
  const response = await api.put(`/devices/${serial}/settings`, patch);
  return response.data;
};

/* ------------------------------------------------------------- commands */

export type CommandName =
  | "engine_cut"
  | "engine_restore"
  | "door_lock"
  | "door_unlock"
  | "locate"
  | "reboot"
  | "set_interval";

export interface DeviceCommand {
  id: number;
  device_serial: string;
  command: CommandName;
  params?: Record<string, unknown>;
  status: "pending" | "sent" | "acked" | "failed" | "expired";
  issued_at: string;
  sent_at?: string;
  acked_at?: string;
  result?: string;
}

/**
 * Queues a command. `confirm` is required server-side for engine_cut and
 * reboot, so the interlock cannot be bypassed by calling the API directly.
 */
export const issueCommand = async (
  serial: string,
  command: CommandName,
  options?: { confirm?: boolean; intervalS?: number }
): Promise<DeviceCommand> => {
  const response = await api.post(`/devices/${serial}/commands`, {
    command,
    confirm: options?.confirm ?? false,
    interval_s: options?.intervalS,
  });
  return response.data;
};

export const getCommands = async (serial: string, limit = 20): Promise<{ commands: DeviceCommand[] }> => {
  const response = await api.get(`/devices/${serial}/commands?limit=${limit}`);
  return response.data;
};

/* --------------------------------------------------- subscription/warranty */

export interface Subscription {
  device_serial: string;
  plan: "trial" | "basic" | "pro";
  started_at: string;
  expires_at: string;
  days_remaining: number;
  is_active: boolean;
  is_expiring: boolean;
}

export interface Warranty {
  device_serial: string;
  purchase_date?: string;
  months: number;
  expires_at?: string;
  days_remaining: number;
  is_active: boolean;
}

export const getSubscription = async (
  serial: string
): Promise<{ subscription: Subscription | null; warranty: Warranty | null }> => {
  const response = await api.get(`/devices/${serial}/subscription`);
  return response.data;
};

export const activateDevice = async (serial: string, secret: string) => {
  const response = await api.post("/activate", {
    serial,
    secret,
  });
  return response.data;
};