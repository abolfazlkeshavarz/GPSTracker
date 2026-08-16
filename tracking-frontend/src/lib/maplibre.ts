import maplibregl from "maplibre-gl";

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
 * Was hardcoded to the production tile server, so local development could not
 * render a map without reaching that host.
 */
export const MAP_STYLE_URL: string =
  import.meta.env.VITE_MAP_STYLE_URL ||
  "https://maps.abolfazl.fun/styles/osm-bright/style.json";
