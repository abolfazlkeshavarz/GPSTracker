import maplibregl from "maplibre-gl";
import { appConfig, isConfigured } from "./appConfig";

/**
 * One-time MapLibre setup, shared by every map component.
 *
 * setRTLTextPlugin throws if it is called more than once, and it rejects
 * asynchronously — so a try/catch around the call does not catch it, it
 * surfaces as an unhandled promise rejection. LiveMap and HistoryMap each
 * called it at module scope, so loading both produced that error.
 *
 * A module-level flag makes it idempotent no matter how many maps exist.
 */
let rtlConfigured = false;

export function ensureMapLibreReady(): void {
  if (rtlConfigured) return;
  rtlConfigured = true;

  // Persian and Arabic labels render as disconnected, reversed glyphs without
  // this plugin.
  const status = (maplibregl as any).getRTLTextPluginStatus?.();
  if (status && status !== "unavailable") return; // already set up (e.g. HMR)

  try {
    maplibregl.setRTLTextPlugin("/rtl/mapbox-gl-rtl-text.js", true /* lazy */);
  } catch {
    // Already registered by a previous module instance; nothing to do.
  }
}

/**
 * Style URL for every map.
 *
 * Precedence: a map server an admin set in the admin panel, then the
 * build-time VITE_MAP_STYLE_URL (e.g. a developer's local tileserver), then
 * the server's default. Read at map creation, after loadAppConfig() ran.
 */
export function mapStyleUrl(): string {
  const cfg = appConfig();
  if (isConfigured("map_style_url") && cfg.map_style_url) return cfg.map_style_url;
  return (
    import.meta.env.VITE_MAP_STYLE_URL ||
    cfg.map_style_url ||
    "https://maps.abolfazl.fun/styles/osm-bright/style.json"
  );
}
