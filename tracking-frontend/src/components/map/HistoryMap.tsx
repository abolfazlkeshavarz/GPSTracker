import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TrackPoint, TrackStop } from "../../api/devices";

import "maplibre-gl/dist/maplibre-gl.css";

import { ensureMapLibreReady, MAP_STYLE_URL } from "../../lib/maplibre";

ensureMapLibreReady();

const ROUTE_SOURCE = "track-route";
const ROUTE_LAYER = "track-route-line";
const ROUTE_CASING = "track-route-casing";
const ARROW_LAYER = "track-route-arrows";

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
      style: MAP_STYLE_URL,
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

  return <div ref={container} style={{ width: "100%", height: "100%" }} />;
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
