import { useEffect, useRef, useState } from "react";

import { initPWA } from "../../lib/pwa";
import { syncPushSubscription } from "../../lib/push";
import { useAuthStore } from "../../store/authStore";
import { UpdatePrompt } from "./PWAPrompts";

/**
 * Owns the service-worker lifecycle for the whole app.
 *
 * Mounted once, above the router, for the same reason RealtimeProvider is:
 * registration must happen once per page load, not once per navigation.
 */
export default function PWAHost() {
  const [reload, setReload] = useState<(() => Promise<void>) | null>(null);
  const token = useAuthStore((s) => s.token);

  // StrictMode double-mounts in development; registering twice produces a
  // duplicate update prompt.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    initPWA((doReload) => {
      // Stored as a thunk: passing a function straight to a state setter makes
      // React call it as an updater instead of storing it.
      setReload(() => doReload);
    });
  }, []);

  // Reconcile the browser's push subscription with the server whenever a
  // session starts. A browser can rotate or drop a subscription on its own,
  // and the failure mode is silent: notifications simply stop.
  useEffect(() => {
    if (!token) return;
    syncPushSubscription();
  }, [token]);

  // The worker asks the page to re-register after the browser rotates a
  // subscription out from under it.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        syncPushSubscription();
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!reload) return null;
  return <UpdatePrompt onReload={reload} />;
}
