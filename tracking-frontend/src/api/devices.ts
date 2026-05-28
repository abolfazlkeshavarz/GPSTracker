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

export const activateDevice = async (serial: string, secret: string) => {
  const response = await api.post("/activate", {
    serial,
    secret,
  });
  return response.data;
};