export interface User {
  id: number;
  phone: string;
}

export interface Device {
  serial: string;
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
  battery: number;
  operator: string;
  ignition: boolean;
  timestamp: number;
}

export interface SignalData {
  device_serial: string;
  gps_bars: number;
  gprs_bars: number;
  satellites: number;
  csq: number;
}