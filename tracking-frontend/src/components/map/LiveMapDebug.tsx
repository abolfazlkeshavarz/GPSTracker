import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
  serial: string;
}

export default function LiveMapDebug({
  lat,
  lng,
  serial,
}: Props) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        duration: 1000,
      });
    }
  }, [lat, lng]);

  return (
    <div style={{ height: "500px", width: "100%" }}>
      <Map
        ref={mapRef}
        mapLib={import('maplibre-gl')}
        initialViewState={{
          longitude: lng,
          latitude: lat,
          zoom: 12,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={{
          version: 8,
          sources: {
            'iran': {
              type: 'vector',
              url: 'http://localhost:8081/data/v3.json',
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#f0efe8' }
            },
            // Just show water to test
            {
              id: 'water-test',
              source: 'iran',
              'source-layer': 'water',
              type: 'fill',
              paint: {
                'fill-color': '#0066ff',
                'fill-opacity': 0.8
              }
            },
            // Show roads to test
            {
              id: 'roads-test',
              source: 'iran',
              'source-layer': 'transportation',
              type: 'line',
              paint: {
                'line-color': '#ff0000',
                'line-width': 2
              }
            }
          ]
        }}
        onLoad={() => console.log('Map loaded')}
        onError={(e) => console.error('Map error:', e)}
        onSourceData={(e) => {
          if (e.sourceId === 'iran' && e.isSourceLoaded) {
            console.log('✅ Tile source loaded successfully');
          }
        }}
        onData={(e) => {
          if (e.dataType === 'source') {
            console.log('📦 Tile data received');
          }
        }}
      >
        <Marker longitude={lng} latitude={lat} anchor="center">
          <div style={{
            background: '#00ff00',
            border: '3px solid white',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
          }} />
        </Marker>

        <Popup longitude={lng} latitude={lat} closeButton={false}>
          <div>{serial}</div>
        </Popup>

        <NavigationControl />
      </Map>
    </div>
  );
}