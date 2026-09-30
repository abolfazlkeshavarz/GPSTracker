import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import maplibregl from "maplibre-gl";
import type { TrackPoint, TrackStop } from "../../api/devices";

import "maplibre-gl/dist/maplibre-gl.css";

import { ensureMapLibreReady, mapStyleUrl } from "../../lib/maplibre";

ensureMapLibreReady();

const ROUTE_SOURCE = "track-route";
const ROUTE_LAYER = "track-route-line";
const ROUTE_CASING = "track-route-casing";
const ARROW_LAYER = "track-route-arrows";

// Backfilled stretches are drawn as a separate dashed line. They are just as
// real as the rest, but they were recovered from a coverage gap rather than
// received live, and a user comparing the map against their memory of the day
// deserves to see which is which.
const BACKFILL_SOURCE = "track-backfill";
const BACKFILL_LAYER = "track-backfill-line";

interface Props {
  points: TrackPoint[];
  stops: TrackStop[];
  /** Highlights one stop and pans to it. */
  focusedStopIndex?: number | null;
  onStopClick?: (index: number) => void;
}

/**
 * Draws a recorded journey: the route line, start/end pins, and a numbered
 * marker for every detected stop.
 *
 * Kept separate from LiveMap because the two behave differently — the live map
 * follows a moving point, this one frames a whole journey.
 */
export default function HistoryMap({
  points,
  stops,
  focusedStopIndex,
  onStopClick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const loadedRef = useRef(false);

  // Create the map once; the data effect below handles every later update.
  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyleUrl(),
      center: [51.389, 35.6892],
      zoom: 11,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));

    map.on("load", () => {
      loadedRef.current = true;

      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });

      // Casing under the main line keeps the route legible over dark tiles.
      map.addLayer({
        id: ROUTE_CASING,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1e3a8a", "line-width": 8, "line-opacity": 0.5 },
      });

      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 4 },
      });

      map.addSource(BACKFILL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: BACKFILL_LAYER,
        type: "line",
        source: BACKFILL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#f59e0b",
          "line-width": 4,
          "line-dasharray": [1.5, 1.5],
        },
      });

      // Direction of travel, so a route that doubles back is readable.
      map.addLayer({
        id: ARROW_LAYER,
        type: "symbol",
        source: ROUTE_SOURCE,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 90,
          "text-field": "▶",
          "text-size": 13,
          "text-keep-upright": false,
          "text-allow-overlap": true,
          "text-rotation-alignment": "map",
        },
        paint: { "text-color": "#1d4ed8", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });

      renderTrack();
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderTrack = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number]);

    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });

    // Contiguous runs of backfilled points, drawn over the main line.
    const backfillSource = map.getSource(BACKFILL_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;

    if (backfillSource) {
      const segments: [number, number][][] = [];
      let current: [number, number][] = [];

      points.forEach((p, i) => {
        if (p.is_backfill) {
          // Start one point earlier so the dashed run visually connects to
          // the live track instead of floating detached from it.
          if (current.length === 0 && i > 0) {
            current.push([points[i - 1].lng, points[i - 1].lat]);
          }
          current.push([p.lng, p.lat]);
        } else if (current.length > 0) {
          current.push([p.lng, p.lat]);
          segments.push(current);
          current = [];
        }
      });
      if (current.length > 1) segments.push(current);

      backfillSource.setData({
        type: "FeatureCollection",
        features: segments.map((coords) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        })),
      });
    }

    // Markers are plain DOM, so they are rebuilt rather than diffed.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (coordinates.length === 0) return;

    markersRef.current.push(
      new maplibregl.Marker({ element: pinElement("#16a34a", "A"), anchor: "bottom" })
        .setLngLat(coordinates[0])
        .setPopup(new maplibregl.Popup({ offset: 28 }).setHTML(
          `<strong>Start</strong><br/>${formatTime(points[0].recorded_at)}`
        ))
        .addTo(map)
    );

    if (coordinates.length > 1) {
      const last = points[points.length - 1];
      markersRef.current.push(
        new maplibregl.Marker({ element: pinElement("#dc2626", "B"), anchor: "bottom" })
          .setLngLat(coordinates[coordinates.length - 1])
          .setPopup(new maplibregl.Popup({ offset: 28 }).setHTML(
            `<strong>End</strong><br/>${formatTime(last.recorded_at)}`
          ))
          .addTo(map)
      );
    }

    stops.forEach((stop, index) => {
      const el = stopElement(index + 1);
      el.addEventListener("click", () => onStopClick?.(index));

      markersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 18 }).setHTML(
              `<strong>Stop ${index + 1} &middot; ${escapeHtml(stop.duration)}</strong><br/>` +
                `Arrived ${formatTime(stop.arrived_at)}<br/>` +
                `Left ${formatTime(stop.departed_at)}`
            )
          )
          .addTo(map)
      );
    });

    // Frame the whole journey.
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
  };

  // Redraw whenever the track changes.
  useEffect(() => {
    if (loadedRef.current) {
      renderTrack();
      return;
    }

    // Style may still be loading on the very first render.
    const map = mapRef.current;
    if (!map) return;

    const onLoad = () => renderTrack();
    map.once("load", onLoad);
    return () => {
      map.off("load", onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, stops]);

  // Pan to a stop selected from the timeline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusedStopIndex == null) return;

    const stop = stops[focusedStopIndex];
    if (!stop) return;

    map.flyTo({ center: [stop.lng, stop.lat], zoom: 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedStopIndex]);

  // ---------------------------------------------------------------- replay
  // Drives a marker along the route so a journey can be watched back, the
  // same way the mobile app's replay scrubber works.
  const { t } = useLanguage();
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const replayMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [trackKey, setTrackKey] = useState(points);
  if (trackKey !== points) {
    // A new track resets the replay (adjusting state during render, not in
    // an effect, so there is no flash of a stale cursor).
    setTrackKey(points);
    setCursor(0);
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= points.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 60);
    return () => clearInterval(id);
  }, [playing, points.length]);

  useEffect(() => {
    const map = mapRef.current;
    const p = points[cursor];
    if (!map || !p || (!playing && cursor === 0)) {
      replayMarkerRef.current?.remove();
      replayMarkerRef.current = null;
      return;
    }
    if (!replayMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:9999px;background:#10b981;border:3px solid #fff;box-shadow:0 0 12px rgba(16,185,129,.8)";
      replayMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
    } else {
      replayMarkerRef.current.setLngLat([p.lng, p.lat]);
    }
    if (playing) map.easeTo({ center: [p.lng, p.lat], duration: 60 });
  }, [cursor, playing, points]);

  const cur = points[cursor];

  return (
    <div className="relative w-full h-full">
      <div ref={container} style={{ width: "100%", height: "100%" }} />
      {points.length > 1 && (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 px-3 py-2 rounded-card bg-surface/90 backdrop-blur border border-line shadow-sm">
          <button
            type="button"
            onClick={() => {
              if (!playing && cursor >= points.length - 1) setCursor(0);
              setPlaying((v) => !v);
            }}
            aria-label={playing ? t("replay.pause") : t("replay.play")}
            title={playing ? t("replay.pause") : t("replay.play")}
            className="grid place-items-center w-9 h-9 rounded-full bg-brand text-white shrink-0 cursor-pointer"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={points.length - 1}
            value={cursor}
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            aria-label={t("replay.play")}
            className="flex-1 accent-[rgb(var(--brand))]"
          />
          {cur && (cursor > 0 || playing) && (
            <span className="text-xs text-content-secondary tnum whitespace-nowrap">
              {new Date(cur.recorded_at).toLocaleTimeString()} · {cur.speed} {t("unit.kmh")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ helpers

function pinElement(color: string, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25c0-8.3-6.7-15-15-15z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <text x="15" y="20" text-anchor="middle" fill="#ffffff"
            font-size="13" font-weight="bold" font-family="sans-serif">${label}</text>
    </svg>`;
  return el;
}

function stopElement(number: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="11" fill="#f59e0b" stroke="#ffffff" stroke-width="3"/>
      <text x="13" y="18" text-anchor="middle" fill="#ffffff"
            font-size="12" font-weight="bold" font-family="sans-serif">${number}</text>
    </svg>`;
  return el;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

// Popup content is built as an HTML string, so anything interpolated is escaped.
function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
