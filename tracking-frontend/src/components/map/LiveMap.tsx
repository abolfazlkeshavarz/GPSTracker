import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

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

      style:
        "http://localhost:8081/styles/osm-bright/style.json",

      center: [lng, lat],
      zoom: 15,

      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl());

    map.on("load", () => {
      console.log("MAP LOADED for device:", serial);

      markerRef.current = new maplibregl.Marker({
        color: "red",
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
        height: "100vh",
      }}
    />
  );
}