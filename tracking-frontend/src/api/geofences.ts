import api from "./axios";

export type TriggerOn = "enter" | "exit" | "both";

export interface Geofence {
  id: number;
  device_serial: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  trigger_on: TriggerOn;
  is_active: boolean;
  created_at: string;
}

export interface CreateGeofenceRequest {
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  trigger_on?: TriggerOn;
}

export const listGeofences = async (serial: string): Promise<Geofence[]> => {
  const response = await api.get(`/devices/${serial}/geofences`);
  return response.data?.geofences ?? [];
};

export const createGeofence = async (serial: string, req: CreateGeofenceRequest): Promise<Geofence> => {
  const response = await api.post(`/devices/${serial}/geofences`, req);
  return response.data;
};

/** Pauses or resumes a fence without losing its definition. */
export const setGeofenceActive = async (serial: string, id: number, isActive: boolean) => {
  const response = await api.put(`/devices/${serial}/geofences/${id}`, { is_active: isActive });
  return response.data;
};

export const deleteGeofence = async (serial: string, id: number) => {
  const response = await api.delete(`/devices/${serial}/geofences/${id}`);
  return response.data;
};
