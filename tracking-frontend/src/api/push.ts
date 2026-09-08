import api from "./axios";

export interface VapidInfo {
  enabled: boolean;
  public_key: string;
}

/** Unauthenticated: the application server key is public by definition. */
export const getVapidKey = async (): Promise<VapidInfo> => {
  const response = await api.get("/push/vapid-key");
  return response.data;
};

export const savePushSubscription = async (sub: PushSubscriptionJSON) => {
  const response = await api.post("/push/subscribe", sub);
  return response.data;
};

export const removePushSubscription = async (endpoint: string) => {
  const response = await api.post("/push/unsubscribe", { endpoint });
  return response.data;
};

/** Sends a notification to the caller's own registered devices. */
export const sendTestPush = async () => {
  const response = await api.post("/push/test");
  return response.data;
};
