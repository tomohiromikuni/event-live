'use client';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import { shapeStyle, type MapShape } from '@/lib/shapes';

export type MapMarker = { id: number; lat: number; lng: number; html: string; title: string; draggable?: boolean };

type Props = {
  /** 見取り図の大きさ（座標は [y, x]、左下が原点） */
  canvas: { w: number; h: number };
  markers: MapMarker[];
  shapes?: MapShape[];
  className?: string;
  onMarkerClick?: (id: number) => void;
  onMapClick?: (y: number, x: number) => void;
  onMarkerDragEnd?: (id: number, y: number, x: number) => void;
  /** 管理画面の作図ツールが地図を直接操作するためのフック */
  onReady?: (map: L.Map, lib: typeof L) => void;
  focus?: { lat: number; lng: number } | null;
};

/**
 * 会場の簡易マップ（見取り図）。背景地図は使わず、白い用紙の上にエリア・線・施設を描く。
 * Leaflet の CRS.Simple を使うので、拡大・縮小・ドラッグはふつうの地図と同じ操作でできる。
 */
export default function LeafletMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((mod) => {
      const lib = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L);
      if (disposed || !el.current) return;
      libRef.current = lib;
      const { w, h } = cbRef.current.canvas;
      const bounds = lib.latLngBounds([0, 0], [h, w]);
      const map = lib.map(el.current, {
        crs: lib.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5,
        attributionControl: false, maxBounds: bounds.pad(0.3), maxBoundsViscosity: 0.8,
      });
      // 用紙（見取り図の範囲）。下敷き（350）・図形（400）より下に置く
      map.createPane('sheet').style.zIndex = '250';
      lib.rectangle(bounds, { pane: 'sheet', color: '#cbd5e1', weight: 1, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(map);
      map.fitBounds(bounds, { padding: [8, 8] });
      const baseZoom = map.getZoom();
      map.setMinZoom(baseZoom - 1);
      // 全体表示より小さくしたときはエリア名を隠して、表示がごちゃつかないようにする
      const toggleLabels = () => map.getContainer().classList.toggle('labels-hidden', map.getZoom() < baseZoom - 0.5);
      map.on('zoomend', toggleLabels);
      map.on('click', (e: L.LeafletMouseEvent) => cbRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
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
      const common = { color: st.color, weight: s.kind === 'line' ? 5 : 2, dashArray: st.dashed ? '8 6' : undefined, interactive: false };
      const layerShape = s.kind === 'area'
        ? lib.polygon(s.coords, { ...common, fillColor: st.color, fillOpacity: 0.18 })
        : lib.polyline(s.coords, { ...common, opacity: 0.85, lineCap: 'round' });
      if (s.label) layerShape.bindTooltip(s.label, { permanent: true, direction: 'center', className: `shape-label ${s.kind}`, opacity: 1 });
      layerShape.addTo(layer);
    }
  }

  function renderMarkers() {
    const lib = libRef.current, layer = markerLayer.current;
    if (!lib || !layer) return;
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
  }

  useEffect(renderShapes, [props.shapes]);
  useEffect(renderMarkers, [props.markers]);

  useEffect(() => {
    if (props.focus && mapRef.current) mapRef.current.panTo([props.focus.lat, props.focus.lng], { animate: true });
  }, [props.focus]);

  return <div ref={el} className={`${props.className ?? 'map'} map-canvas`} role="application" aria-label="会場の簡易マップ" />;
}
