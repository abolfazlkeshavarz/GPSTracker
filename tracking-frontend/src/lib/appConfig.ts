/*
Runtime platform settings from GET /api/app-config — currently the map
server. An admin changes them in the admin panel and every browser picks the
new values up on its next load, with no rebuild.
*/

export interface AppConfig {
  map_style_url?: string;
  map_tile_url?: string;
  map_attribution?: string;
  /** Comma-separated keys an admin explicitly set (vs. server defaults). */
  configured?: string;
}

let current: AppConfig = {};

export const appConfig = (): AppConfig => current;

/** True when an admin has explicitly set this key on the server. */
export const isConfigured = (key: keyof AppConfig): boolean =>
  (current.configured ?? "").split(",").includes(key);

/**
 * Fetches the settings once at start-up. Never rejects and never waits more
 * than `timeoutMs`: a slow or failing config endpoint must not keep the app
 * from rendering — the build-time defaults are used instead.
 */
export async function loadAppConfig(timeoutMs = 2500): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/app-config", { signal: ctrl.signal });
    if (res.ok) current = (await res.json()) as AppConfig;
  } catch {
    // Offline or blocked: keep the defaults.
  } finally {
    clearTimeout(timer);
  }
}
