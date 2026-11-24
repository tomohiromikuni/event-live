'use client';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import { shapeStyle, type MapShape } from '@/lib/shapes';

export type MapMarker = { id: number; lat: number; lng: number; html: string; title: string; draggable?: boolean };

type Props = {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  shapes?: MapShape[];
  /** 背景地図: light=薄く / normal=通常 / none=非表示 */
  mapStyle?: string;
  className?: string;
  fitToMarkers?: boolean;
  onMarkerClick?: (id: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDragEnd?: (id: number, lat: number, lng: number) => void;
  onShapeClick?: (id: number) => void;
  /** 管理画面の作図ツールが地図を直接操作するためのフック */
  onReady?: (map: L.Map, lib: typeof L) => void;
  focus?: { lat: number; lng: number } | null;
};

// タイルは環境変数で差し替え可能（本番は商用利用条件を満たすタイル提供元を使う）
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Leaflet の薄いラッパー。会場マップ＝ベース地図 ＋ 簡易マップ（エリア・線）＋ 施設マーカー。
 */
export default function LeafletMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;
  const fitted = useRef(false);

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((mod) => {
      const lib = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L);
      if (disposed || !el.current) return;
      libRef.current = lib;
      const map = lib.map(el.current, { zoomControl: true, maxZoom: 20, zoomSnap: 0.25, zoomDelta: 0.5 }).setView(props.center, props.zoom);
      if (cbRef.current.mapStyle !== 'none') {
        lib.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: TILE_ATTR }).addTo(map);
      } else {
        map.attributionControl.setPrefix(false);
      }
      map.on('click', (e: L.LeafletMouseEvent) => cbRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
      // 縮小しているときはエリア名を隠して、表示がごちゃつかないようにする
      const toggleLabels = () => map.getContainer().classList.toggle('labels-hidden', map.getZoom() < 14);
      map.on('zoomend', toggleLabels);
      toggleLabels();
      shapeLayer.current = lib.layerGroup().addTo(map);
      markerLayer.current = lib.layerGroup().addTo(map);
      mapRef.current = map;
      renderShapes();
      renderMarkers();
      cbRef.current.onReady?.(map, lib);
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderShapes() {
    const lib = libRef.current, layer = shapeLayer.current;
    if (!lib || !layer) return;
    layer.clearLayers();
    for (const s of cbRef.current.shapes ?? []) {
      if (s.coords.length < 2) continue;
      const st = shapeStyle(s.style);
      const common = { color: st.color, weight: s.kind === 'line' ? 5 : 2, dashArray: st.dashed ? '8 6' : undefined, interactive: !!cbRef.current.onShapeClick };
      const layerShape = s.kind === 'area'
        ? lib.polygon(s.coords, { ...common, fillColor: st.color, fillOpacity: 0.18 })
        : lib.polyline(s.coords, { ...common, opacity: 0.85, lineCap: 'round' });
      if (s.label) {
        layerShape.bindTooltip(s.label, { permanent: true, direction: 'center', className: `shape-label ${s.kind}`, opacity: 1 });
      }
      if (cbRef.current.onShapeClick) layerShape.on('click', (e) => { lib.DomEvent.stopPropagation(e); cbRef.current.onShapeClick?.(s.id); });
      layerShape.addTo(layer);
    }
  }

  function renderMarkers() {
    const lib = libRef.current, layer = markerLayer.current, map = mapRef.current;
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
    const pts: [number, number][] = [
      ...cbRef.current.markers.map((m) => [m.lat, m.lng] as [number, number]),
      ...(cbRef.current.shapes ?? []).flatMap((s) => s.coords),
    ];
    if (cbRef.current.fitToMarkers && !fitted.current && pts.length > 1) {
      fitted.current = true;
      map.fitBounds(lib.latLngBounds(pts), { padding: [28, 28], maxZoom: 18 });
    }
  }

  useEffect(renderShapes, [props.shapes]);
  useEffect(renderMarkers, [props.markers]);

  useEffect(() => {
    if (props.focus && mapRef.current) mapRef.current.panTo([props.focus.lat, props.focus.lng], { animate: true });
  }, [props.focus]);

  const style = props.mapStyle ?? 'normal';
  return <div ref={el} className={`${props.className ?? 'map'} map-style-${style}`} role="application" aria-label="会場マップ" />;
}
