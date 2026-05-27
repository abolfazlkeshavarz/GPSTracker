import api from "./axios";

export const getDevices = async () => {
  const response =
    await api.get("/devices");

  return response.data;
};

export const getLatestLocation =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/latest`
      );

    return response.data;
  };

export const getDeviceStatus =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/status`
      );

    return response.data;
  };

export const getSignal =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/signal`
      );

    return response.data;
  };

export const getHistory =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/history`
      );

    return response.data;
  };

export const activateDevice =
  async (serial: string) => {
    const response =
      await api.post(
        "/activate",
        {
          serial,
        }
      );

    return response.data;
  };