import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

// maplibre throws if this is called more than once, which happens on HMR
// reloads of this module during development.
try {
  maplibregl.setRTLTextPlugin(
    "/rtl/mapbox-gl-rtl-text.js",
    true // lazy load
  );
} catch {
  // Plugin already registered.
}

// The style URL was hardcoded to the production tile server, so a local dev
// session could not render a map without internet access to that host. Point
// VITE_MAP_STYLE_URL at the local tileserver-gl container to work offline.
const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ||
  "https://maps.abolfazl.fun/styles/osm-bright/style.json";

interface Props {
  lat: number;
  lng: number;
  serial: string;  // Add serial prop
}

export default function LiveMap({ lat, lng, serial }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE_URL,
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl());

    map.on("load", () => {
      console.log("MAP LOADED for device:", serial);

      // Create custom car icon using SVG
      const carIcon = document.createElement("div");
      carIcon.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V19C3 19.55 3.45 20 4 20H5C5.55 20 6 19.55 6 19V18H18V19C18 19.55 18.45 20 19 20H20C20.55 20 21 19.55 21 19V12L18.92 6.01Z" 
          fill="#FF5722" stroke="#333" stroke-width="1"/>
          <circle cx="7.5" cy="16.5" r="1.5" fill="#333"/>
          <circle cx="16.5" cy="16.5" r="1.5" fill="#333"/>
          <path d="M4 12H20L18.5 7H5.5L4 12Z" fill="#FF8A65" stroke="#333" stroke-width="0.5"/>
        </svg>
      `;
      carIcon.style.cursor = "pointer";
      carIcon.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.3))";

      markerRef.current = new maplibregl.Marker({
        element: carIcon,
      })
        .setLngLat([lng, lat])
        .addTo(map);

      map.resize();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    markerRef.current?.setLngLat([lng, lat]);

    mapRef.current.easeTo({
      center: [lng, lat],
      duration: 1000,
    });
  }, [lat, lng]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        // 100vh overflowed the fixed-height card this map is rendered into,
        // pushing the bottom of the map out of view. Fill the parent instead.
        height: "100%",
      }}
    />
  );
}