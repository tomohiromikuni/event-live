'use client';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import { shapeStyle, type MapShape } from '@/lib/shapes';

export type MapMarker = { id: number; lat: number; lng: number; html: string; title: string; draggable?: boolean };

type Props = {
  /** 見取り図の大きさ（座標は [y, x]、左下が原点）。geo のときは使わない */
  canvas: { w: number; h: number };
  /** true = 座標は緯度経度。背景に国土地理院の地図（淡色）を表示する（マイマップから取り込んだ地図） */
  geo?: boolean;
  /** geo で施設が1つも無いときの表示位置 */
  center?: [number, number];
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
 * 会場の簡易マップ。
 * - 見取り図（canvas）: 背景地図は使わず、白い用紙の上にエリア・線・施設を描く（Leaflet の CRS.Simple）。
 * - 地図（geo）: 緯度経度で描き、背景に国土地理院の淡色地図を表示する（会場が街全体に広がるイベント向け）。
 */
const GSI_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">出典：国土地理院（地理院タイル）</a>';

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
      let map: L.Map;
      if (cbRef.current.geo) {
        const pts: [number, number][] = [
          ...cbRef.current.markers.map((m) => [m.lat, m.lng] as [number, number]),
          ...(cbRef.current.shapes ?? []).flatMap((s) => s.coords),
        ];
        map = lib.map(el.current, { minZoom: 5, maxZoom: 18, zoomSnap: 0.25, zoomDelta: 0.5 });
        map.attributionControl.setPrefix(false);
        lib.tileLayer(GSI_TILE, { maxZoom: 18, maxNativeZoom: 18, attribution: GSI_ATTR }).addTo(map);
        if (pts.length > 1) map.fitBounds(lib.latLngBounds(pts), { padding: [16, 16] });
        else map.setView(pts[0] ?? cbRef.current.center ?? [36.5, 138], pts.length || cbRef.current.center ? 16 : 5);
      } else {
        const { w, h } = cbRef.current.canvas;
        const bounds = lib.latLngBounds([0, 0], [h, w]);
        map = lib.map(el.current, {
          crs: lib.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5,
          attributionControl: false, maxBounds: bounds.pad(0.3), maxBoundsViscosity: 0.8,
        });
        // 用紙（見取り図の範囲）。下敷き（350）・図形（400）より下に置く
        map.createPane('sheet').style.zIndex = '250';
        lib.rectangle(bounds, { pane: 'sheet', color: '#cbd5e1', weight: 1, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(map);
        map.fitBounds(bounds, { padding: [8, 8] });
        map.setMinZoom(map.getZoom() - 1);
      }
      const baseZoom = map.getZoom();
      // 表示がごちゃつかないように、縮小時は名前を隠す。施設が多いマップでは全体表示中は施設を小さな点にし、拡大すると元に戻す
      const toggleLabels = () => {
        const z = map.getZoom(), c = map.getContainer();
        const dense = cbRef.current.markers.length > 20;
        c.classList.toggle('labels-hidden', z < baseZoom - 0.5 || (dense && z < baseZoom + 1));
        c.classList.toggle('markers-small', dense && z < baseZoom + 1);
      };
      map.on('zoomend', toggleLabels);
      toggleLabels();
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
  useEffect(() => { renderMarkers(); mapRef.current?.fire('zoomend'); }, [props.markers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (props.focus && mapRef.current) mapRef.current.panTo([props.focus.lat, props.focus.lng], { animate: true });
  }, [props.focus]);

  return <div ref={el} className={`${props.className ?? 'map'} ${props.geo ? 'map-geo' : 'map-canvas'}`} role="application" aria-label="会場の簡易マップ" />;
}
