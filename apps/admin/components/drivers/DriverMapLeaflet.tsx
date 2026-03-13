'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// Fix default marker icon when bundling (e.g. Next.js)
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type DriverMapLeafletProps = {
  coords: [number, number];
  name?: string;
  height: number;
};

/** Expects coords as [longitude, latitude] (GeoJSON). Leaflet uses [lat, lng]. */
export function DriverMapLeaflet({ coords, name, height }: DriverMapLeafletProps) {
  const [lng, lat] = coords;
  const position: [number, number] = [lat, lng];

  return (
    <MapContainer
      center={position}
      zoom={15}
      style={{ height: '100%', width: '100%', minHeight: height }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position}>
        {name ? <Popup>{name}</Popup> : null}
      </Marker>
    </MapContainer>
  );
}
