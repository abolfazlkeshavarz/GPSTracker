import { getVapidKey, removePushSubscription, savePushSubscription } from "../api/push";

/*
Web Push enrolment.

The browser owns the cryptography: PushManager.subscribe() generates a key
pair, keeps the private half, and hands back an endpoint plus the public half.
All this module does is get permission, pass that registration to the server,
and keep the two in step.

Two rules worth stating, because getting either wrong produces a feature that
appears to work and silently never fires:

  - Permission must be requested from a USER GESTURE. Browsers reject (and
    Safari permanently denies) a prompt raised on page load, so every entry
    point here is called from a click.

  - The stored subscription and the browser's must be reconciled on startup.
    A browser can drop a subscription on its own — permission reset, storage
    cleared, subscription rotated — and the server would keep pushing into a
    dead endpoint forever.
*/

/** Whether this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on";

/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 *
 * Note the padding restore: base64url drops '=' padding, and atob rejects an
 * unpadded string in some browsers rather than tolerating it.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");

  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);

  return output;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Current enrolment state, for rendering the toggle. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const { enabled } = await getVapidKey().catch(() => ({ enabled: false, public_key: "" }));
  if (!enabled) return "unconfigured";

  if (Notification.permission === "denied") return "denied";

  const reg = await registration();
  const existing = await reg?.pushManager.getSubscription();

  return existing ? "on" : "off";
}

/**
 * Requests permission, subscribes, and registers the endpoint server-side.
 *
 * Must be called from a click handler.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const { enabled, public_key } = await getVapidKey();
  if (!enabled || !public_key) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "off";
  }

  const reg = await registration();
  if (!reg) return "unsupported";

  // Reuse an existing subscription when there is one; calling subscribe()
  // again with a different application key throws rather than replacing it.
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      // Required to be true by every current browser: a push that shows no
      // notification is not allowed.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
    });
  }

  await savePushSubscription(sub.toJSON());
  return "on";
}

/** Unsubscribes this browser and forgets it server-side. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();

  if (!sub) return "off";

  const { endpoint } = sub;

  // Drop the server row first. If the order were reversed and the request
  // failed, the browser would be unsubscribed while the server kept a row it
  // could never deliver to — invisible, and only noticed as "notifications
  // stopped working" much later.
  await removePushSubscription(endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});

  return "off";
}

/**
 * Reconciles the browser's subscription with the server's on startup.
 *
 * Cheap and idempotent: re-POSTing an unchanged subscription is an upsert.
 * Without it, a rotated subscription means notifications stop with no error
 * anywhere the user can see.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;

  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await savePushSubscription(sub.toJSON());
  } catch {
    // Best-effort: a failed resync must never break app startup.
  }
}
