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
 * URL of the signed trip certificate.
 *
 * Returned as a URL rather than fetched, so the browser downloads it directly
 * — the document is meant to be kept and handed to someone else.
 */
export const certificateUrl = (serial: string, from: string, to: string): string => {
  const params = new URLSearchParams({ from, to, download: "1" });
  return `/api/devices/${serial}/certificate?${params.toString()}`;
};

export const activateDevice = async (serial: string, secret: string) => {
  const response = await api.post("/activate", {
    serial,
    secret,
  });
  return response.data;
};