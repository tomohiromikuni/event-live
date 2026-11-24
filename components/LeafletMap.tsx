'use client';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';

export type MapMarker = { id: number; lat: number; lng: number; html: string; title: string; draggable?: boolean };

type Props = {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  className?: string;
  fitToMarkers?: boolean;
  onMarkerClick?: (id: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDragEnd?: (id: number, lat: number, lng: number) => void;
  focus?: { lat: number; lng: number } | null;
};

// タイルは環境変数で差し替え可能（本番は商用利用条件を満たすタイル提供元を使う）
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Leaflet の薄いラッパー。会場マップは「ベース地図 + 独自デザインの地点マーカー」で構成する。 */
export default function LeafletMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;
  const fitted = useRef(false);

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((mod) => {
      const lib = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L);
      if (disposed || !el.current) return;
      libRef.current = lib;
      const map = lib.map(el.current, { zoomControl: true, tap: true } as L.MapOptions).setView(props.center, props.zoom);
      lib.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
      map.on('click', (e: L.LeafletMouseEvent) => cbRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
      layerRef.current = lib.layerGroup().addTo(map);
      mapRef.current = map;
      renderMarkers();
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMarkers() {
    const lib = libRef.current, layer = layerRef.current, map = mapRef.current;
    if (!lib || !layer || !map) return;
    layer.clearLayers();
    for (const m of cbRef.current.markers) {
      const icon = lib.divIcon({ className: 'mk-wrap', html: m.html, iconSize: [36, 36], iconAnchor: [18, 18] });
      const marker = lib.marker([m.lat, m.lng], { icon, title: m.title, draggable: !!m.draggable, keyboard: true, riseOnHover: true });
      marker.on('click', () => cbRef.current.onMarkerClick?.(m.id));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        cbRef.current.onMarkerDragEnd?.(m.id, p.lat, p.lng);
      });
      marker.addTo(layer);
    }
    if (cbRef.current.fitToMarkers && !fitted.current && cbRef.current.markers.length > 1) {
      fitted.current = true;
      map.fitBounds(lib.latLngBounds(cbRef.current.markers.map((m) => [m.lat, m.lng])), { padding: [30, 30], maxZoom: 18 });
    }
  }

  useEffect(renderMarkers, [props.markers]);

  useEffect(() => {
    if (props.focus && mapRef.current) mapRef.current.panTo([props.focus.lat, props.focus.lng], { animate: true });
  }, [props.focus]);

  return <div ref={el} className={props.className ?? 'map'} role="application" aria-label="会場マップ" />;
}
