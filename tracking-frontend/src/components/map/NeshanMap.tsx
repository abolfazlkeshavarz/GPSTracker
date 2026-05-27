import { useEffect, useRef } from "react";

// Declare L as global type since it's loaded from CDN
declare global {
  interface Window {
    L: any;
  }
}

interface Props {
  lat: number;
  lng: number;
  serial: string;
}

export default function NeshanMap({ lat, lng, serial }: Props) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const containerId = "neshan-map";

  useEffect(() => {
    // Check if map already exists
    if (mapRef.current) {
      return;
    }

    // Make sure L (Leaflet) is loaded from CDN
    if (!window.L) {
      console.error("Neshan SDK not loaded yet");
      return;
    }

    // Your API key - REPLACE THIS with your actual key
    const API_KEY = "service.e0dc7be270bf4b5490cf2fbc39cc5652"; // ← Get from https://platform.neshan.org/

    // Create map instance with Neshan
    const map = new window.L.Map(containerId, {
      key: API_KEY,
      maptype: "dreamy", // Options: "neshan", "dreamy", "standard", "raster"
      center: [lat, lng],
      zoom: 15,
      poi: true, // Show points of interest
      traffic: false, // Show traffic layer
    });

    // Add custom marker
    const customIcon = window.L.divIcon({
      className: "custom-marker",
      html: `
        <div style="
          background-color: #FF5722;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.3);
        "></div>
        <div style="
          width: 40px;
          height: 40px;
          background-color: rgba(255,87,34,0.3);
          border-radius: 50%;
          position: absolute;
          top: -14px;
          left: -14px;
          animation: pulse 1.5s ease-out infinite;
        "></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    // Add marker
    const marker = window.L.marker([lat, lng], { icon: customIcon }).addTo(map);
    
    // Add popup
    marker.bindPopup(`
      <div style="font-family: sans-serif; padding: 8px; min-width: 200px;">
        <strong>📍 Device:</strong> ${serial}<br/>
        <strong>🛰️ Lat:</strong> ${lat.toFixed(6)}<br/>
        <strong>🛰️ Lng:</strong> ${lng.toFixed(6)}<br/>
        <strong>🕐 Time:</strong> ${new Date().toLocaleString()}
      </div>
    `).openPopup();

    // Store references
    mapRef.current = map;
    markerRef.current = marker;

    // Add CSS animation for pulsing marker
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% {
          transform: scale(0.8);
          opacity: 1;
        }
        100% {
          transform: scale(2);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      style.remove();
    };
  }, []); // Run only once on mount

  // Update marker position when lat/lng changes
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
      
      // Update popup content
      markerRef.current.bindPopup(`
        <div style="font-family: sans-serif; padding: 8px; min-width: 200px;">
          <strong>📍 Device:</strong> ${serial}<br/>
          <strong>🛰️ Lat:</strong> ${lat.toFixed(6)}<br/>
          <strong>🛰️ Lng:</strong> ${lng.toFixed(6)}<br/>
          <strong>🕐 Updated:</strong> ${new Date().toLocaleString()}
        </div>
      `);
    }
  }, [lat, lng, serial]);

  return (
    <div 
      style={{ 
        height: "500px", 
        width: "100%", 
        position: "relative",
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "#e5e7eb"
      }}
    >
      <div 
        id={containerId} 
        style={{ 
          height: "100%", 
          width: "100%" 
        }}
      />
    </div>
  );
}