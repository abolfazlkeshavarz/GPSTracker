import { registerSW } from "virtual:pwa-register";

/*
Service-worker lifecycle and install prompt.

Kept out of React on purpose. Registration has to happen once per page load,
not once per mount, and the `beforeinstallprompt` event fires early enough
that a listener attached from a component effect regularly misses it.
*/

type UpdateCallback = (reload: () => Promise<void>) => void;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

/**
 * Registers the worker and reports when a new version is waiting.
 *
 * The callback is handed the function that actually activates the update, so
 * the UI decides when to swap — a shell that reloads itself mid-journey,
 * while someone is watching a vehicle move, is worse than a stale one.
 */
export function initPWA(onNeedRefresh: UpdateCallback) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh(async () => {
        await updateSW?.(true);
      });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      // Browsers only check for a new worker on navigation, and this app is a
      // SPA that a user may leave open for days. An hourly poll is what makes
      // "prompt to update" actually reach a long-lived session.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });
}

/* --------------------------------------------------------- install prompt */

// The Chromium-only event that lets an app offer its own install button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Chrome shows its own mini-infobar unless the event is cancelled; taking
    // it over is what allows the prompt to appear next to an explanation of
    // why installing matters here (notifications only work reliably from an
    // installed app on iOS).
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((fn) => fn(true));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((fn) => fn(false));
  });
}

/** Whether the browser has offered an install prompt we can raise. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Subscribes to install-availability changes. Returns an unsubscribe fn. */
export function onInstallAvailable(fn: (available: boolean) => void): () => void {
  installListeners.add(fn);
  fn(canInstall());
  return () => installListeners.delete(fn);
}

/** Raises the browser's install prompt. Must be called from a user gesture. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  // The event is single-use: a dismissed prompt cannot be re-raised until the
  // browser decides to fire it again.
  deferredPrompt = null;
  installListeners.forEach((f) => f(false));

  return outcome === "accepted";
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari predates the display-mode media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS installs only from Safari's Share menu — there is no
 * `beforeinstallprompt` — and on iOS Web Push works ONLY once installed. The
 * UI needs to tell those users something different, so it needs to know.
 */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
