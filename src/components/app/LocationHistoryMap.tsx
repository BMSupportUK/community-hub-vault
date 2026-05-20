import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocationHistoryRow } from "@/lib/user-location-history.functions";

// Fix Leaflet default icon paths (Vite/Webpack break the bundled URLs)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const gpsIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "hue-rotate-gps",
});

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    map.fitBounds(points, { padding: [30, 30], maxZoom: 13 });
  }, [points, map]);
  return null;
}

export function LocationHistoryMap({ rows }: { rows: LocationHistoryRow[] }) {
  const points = useMemo(
    () =>
      rows
        .map((r) => ({
          row: r,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
        }))
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => ({
          row: p.row,
          coord: [p.latitude, p.longitude] as [number, number],
        })),
    [rows],
  );

  if (points.length === 0) {
    return (
      <div className="grid place-items-center h-full text-sm text-muted-foreground p-6 text-center">
        No coordinates recorded yet. Coordinates appear here once the user grants location
        permission.
      </div>
    );
  }

  const center = points[0].coord;

  return (
    <MapContainer center={center} zoom={3} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points.map((p) => p.coord)} />
      {points.map(({ row, coord }) => (
        <Marker key={row.id} position={coord} icon={row.event_type === "gps" ? gpsIcon : undefined}>
          <Popup>
            <div className="text-xs space-y-0.5">
              <div className="font-semibold capitalize">{row.event_type}</div>
              <div>{new Date(row.created_at).toLocaleString()}</div>
              {row.ip && <div className="font-mono">{row.ip}</div>}
              {(row.city || row.region || row.country) && (
                <div>{[row.city, row.region, row.country].filter(Boolean).join(", ")}</div>
              )}
              {row.accuracy_m != null && <div>± {Math.round(row.accuracy_m)} m</div>}
              {row.is_vpn && <div className="text-red-600 font-semibold">VPN</div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
