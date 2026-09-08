/// <reference lib="webworker" />

/*
 * Service worker.
 *
 * Three jobs, in order of how much they matter to this product:
 *
 *   1. PUSH NOTIFICATIONS. This is the only code that runs when the app is
 *      closed, so it is the only thing that can tell someone their car is
 *      being towed at 3am. Everything else here is a convenience; this is the
 *      feature.
 *
 *   2. Offline app shell. A tracker is most useful in a car park with one bar
 *      of signal. Precaching the shell means the app opens and shows the last
 *      known state instead of a browser error page.
 *
 *   3. Update handling. A stale shell against a changed API is a support call,
 *      so a new worker is installed but never activated behind the user's
 *      back — the app asks first.
 */

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

/* ------------------------------------------------------------- precaching */

// Injected at build time by vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations resolve to the cached index.html. /api and the WebSocket
// upgrade are excluded — serving an HTML shell in answer to an API call
// produces a JSON parse error that is very hard to trace back to here.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/tiles\//],
  })
);

// Map tiles and glyphs: immutable once published and expensive to re-fetch,
// so cache-first with a hard cap. Without the cap a few minutes of panning
// can put hundreds of megabytes in the origin's storage quota.
registerRoute(
  ({ url }) => url.pathname.startsWith("/tiles/"),
  new CacheFirst({
    cacheName: "map-tiles",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Fonts, same reasoning.
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: "fonts",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  })
);

// The device list is the one API response worth serving stale: it is what the
// app needs to render anything at all, and a slightly out-of-date list of
// vehicles beats an error screen. Everything else — positions, alerts — is
// deliberately not cached, because stale location data is worse than none.
registerRoute(
  ({ url }) => url.pathname === "/api/devices",
  new NetworkFirst({
    cacheName: "device-list",
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 })],
  })
);

/* --------------------------------------------------------------- updating */

// Activate a waiting worker only when the page asks. The app shows a prompt;
// silently swapping the shell mid-session can leave a half-updated tab.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ----------------------------------------------------------------- push */

interface PushPayload {
  type?: string;
  alert_id?: number;
  device_serial?: string;
  kind?: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  body?: string;
  url?: string;
  silent?: boolean;
}

self.addEventListener("push", (event: PushEvent) => {
  // A push with no data still has to show something. Browsers revoke push
  // permission from origins that receive a push and display no notification,
  // so there is no "ignore it" branch here.
  let payload: PushPayload = { title: "Rad Gard", body: "New activity on your vehicle." };

  if (event.data) {
    try {
      payload = { ...payload, ...(event.data.json() as PushPayload) };
    } catch {
      payload.body = event.data.text();
    }
  }

  const critical = payload.severity === "critical";

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      // Group by device and rule so a flapping geofence leaves one
      // notification rather than forty, but let a second collision through.
      tag: payload.kind && payload.device_serial ? `${payload.kind}-${payload.device_serial}` : undefined,
      renotify: critical,
      requireInteraction: critical,
      silent: payload.silent ?? false,
      // A distinct pattern for the theft-grade alerts: someone half-awake
      // should be able to tell them from a routine notification without
      // looking at the screen.
      vibrate: critical ? [300, 100, 300, 100, 300] : [200],
      timestamp: Date.now(),
      data: {
        url: payload.url || "/alerts",
        alertId: payload.alert_id,
        deviceSerial: payload.device_serial,
      },
    } as NotificationOptions)
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const target = (event.notification.data?.url as string) || "/alerts";

  // Focus an existing tab rather than opening a fifth copy of the app, which
  // is what happens by default when someone taps several alerts in a row.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Chrome fires this when a push subscription is rotated or revoked. Without
// re-registering, notifications stop silently and the user has no way to know.
self.addEventListener("pushsubscriptionchange", (event: Event) => {
  const e = event as ExtendableEvent;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
    })
  );
});
