export interface User {
  id: number;
  phone: string;
  created_at: string;
}

export interface Device {
  serial: string;
  name?: string;
  user_id: number;
  activated_at: string;
}

export interface LocationData {
  device: string;
  lat: number;
  lng: number;
  speed: number;
  sat: number;
  csq: number;
  battery?: number;
  operator?: string;
  ignition?: boolean;
  timestamp?: number;
}

export interface ActivateDeviceRequest {
  serial: string;
  secret: string;
}

export interface SignalData {
  device_serial: string;
  gps_bars: number;
  gprs_bars: number;
  satellites: number;
  csq: number;
  updated_at: string;
}

export interface DeviceStatus {
  device: string;
  online: boolean;
}