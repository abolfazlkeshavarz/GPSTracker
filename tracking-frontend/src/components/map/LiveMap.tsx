import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import { ensureMapLibreReady, MAP_STYLE_URL } from "../../lib/maplibre";

ensureMapLibreReady();

interface Props {
  lat: number;
  lng: number;
  serial: string;
  /** Course over ground in degrees; rotates the marker when present. */
  heading?: number;
}

export default function LiveMap({ lat, lng, serial, heading }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const arrowRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));

    map.on("load", () => {
      const el = markerElement();
      arrowRef.current = el.querySelector("svg");

      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      applyHeading(arrowRef.current, heading);
      map.resize();
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      arrowRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Intentionally mount-only: the effect below follows position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    markerRef.current.setLngLat([lng, lat]);
    applyHeading(arrowRef.current, heading);

    mapRef.current.easeTo({ center: [lng, lat], duration: 900 });
  }, [lat, lng, heading]);

  return (
    <div
      ref={container}
      aria-label={`Map showing device ${serial}`}
      // 100%, not 100vh: the map sits inside a fixed-height card, and a
      // viewport-height child overflowed it.
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/** Rotates the marker to match course over ground, if the device reports it. */
function applyHeading(svg: SVGSVGElement | null, heading?: number) {
  if (!svg) return;

  const known = typeof heading === "number" && Number.isFinite(heading);
  svg.style.transform = known ? `rotate(${heading}deg)` : "none";
  // A plain dot when there is no heading, so the arrow never implies a
  // direction the device did not report.
  svg.dataset.known = known ? "1" : "0";
}

function markerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "width:34px;height:34px;display:grid;place-items:center;";

  el.innerHTML = `
    <span style="
      position:absolute;width:34px;height:34px;border-radius:9999px;
      background:rgb(var(--brand) / 0.18);
    "></span>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg"
         style="position:relative;transition:transform 400ms ease;">
      <path d="M12 2 L19 20 L12 16 L5 20 Z"
            fill="rgb(var(--brand))" stroke="white" stroke-width="1.5"
            stroke-linejoin="round"/>
    </svg>`;

  return el;
}
