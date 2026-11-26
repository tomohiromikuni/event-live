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
  /** geo のとき「現在地」ボタンを出す（位置はこの端末の画面に表示するだけ。サーバーには送らない・保存しない） */
  locate?: boolean;
  /** 地図のボタン・案内の言語 */
  lang?: 'ja' | 'en';
  /** 小さな地図（タップした施設の場所を見せる）：その施設を中心に表示し、近くにいれば自分の位置も入れる */
  mini?: boolean;
  /** 自分の位置（mini のときに青い点で出す。端末の画面の中だけ） */
  me?: [number, number] | null;
};

/**
 * 会場の簡易マップ。
 * - 見取り図（canvas）: 背景地図は使わず、白い用紙の上にエリア・線・施設を描く（Leaflet の CRS.Simple）。
 * - 地図（geo）: 緯度経度で描き、背景に国土地理院の淡色地図を表示する（会場が街全体に広がるイベント向け）。
 */
/** 現在地が会場からこれより遠ければ、地図を動かさない */
const FAR_M = 3000;
const GSI_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">出典：国土地理院（地理院タイル）</a>';

export default function LeafletMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const homeRef = useRef<(() => void) | null>(null);
  const venueRef = useRef<L.LatLng | null>(null);
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
        // 会場の表示（最初の表示・「会場へ」ボタンで戻る先）
        const m0 = map;
        homeRef.current = () => {
          if (pts.length > 1) m0.fitBounds(lib.latLngBounds(pts), { padding: [36, 36] });
          else m0.setView(pts[0] ?? cbRef.current.center ?? [36.5, 138], pts.length || cbRef.current.center ? 16 : 5);
        };
        venueRef.current = pts.length ? lib.latLngBounds(pts).getCenter() : cbRef.current.center ? lib.latLng(cbRef.current.center) : null;
        homeRef.current();
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
      if (cbRef.current.geo && cbRef.current.locate) addLocateControl(map, lib);
      if (cbRef.current.mini) showMini(map, lib);
      cbRef.current.onReady?.(map, lib);
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 小さな地図：施設を真ん中に。自分が2km以内なら自分と施設の両方が入るように */
  function showMini(map: L.Map, lib: typeof L) {
    const m = cbRef.current.markers[0];
    if (!m) return;
    const me = cbRef.current.geo ? cbRef.current.me : null;
    if (me) lib.circleMarker(me, { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(map);
    if (me && map.distance(me, [m.lat, m.lng]) < 2000) map.fitBounds(lib.latLngBounds([me, [m.lat, m.lng]]), { padding: [34, 34], maxZoom: 17 });
    else map.setView([m.lat, m.lng], cbRef.current.geo ? 17 : map.getZoom() + 1.5);
  }

  /** 現在地がうまく使えないときの案内（端末・アプリ別） */
  function locateHelp(kind: 'denied' | 'failed' | 'unsupported') {
    const ua = navigator.userAgent;
    if (cbRef.current.lang === 'en') {
      if (/Line\/|FBAN|FBAV|Instagram|Twitter/i.test(ua)) return 'Location may not work inside apps. Open this page in Safari or your browser from the app menu.';
      if (kind === 'unsupported') return 'Location is not available on this device or browser.';
      if (kind === 'failed') return 'Could not get your location. Try again where the signal is better.';
      if (/iPhone|iPad|iPod/.test(ua)) return 'Location is not allowed. On iPhone: Settings → Privacy & Security → Location Services → turn on, and set “Safari Websites” to “While Using”. Then tap again.';
      if (/Android/.test(ua)) return 'Location is not allowed. Tap the lock (or ⓘ) icon in the address bar → Permissions → Location → Allow. Then tap again.';
      return 'Location is not allowed. Allow location for this site from the lock icon in the address bar.';
    }
    if (/Line\/|FBAN|FBAV|Instagram|Twitter/i.test(ua)) return 'アプリの中のブラウザでは現在地を使えないことがあります。右上（または右下）のメニューから「Safari／ブラウザで開く」を選んで、開き直してください。';
    if (kind === 'unsupported') return 'この端末・ブラウザでは現在地を使えません。';
    if (kind === 'failed') return '現在地を取得できませんでした。電波の良い場所で、もう一度お試しください。';
    if (/iPhone|iPad|iPod/.test(ua)) return '位置情報が許可されていません。iPhone の「設定」→「プライバシーとセキュリティ」→「位置情報サービス」をオンにし、「Safari の Web サイト」を「使用中のみ」にしてから、もう一度押してください。';
    if (/Android/.test(ua)) return '位置情報が許可されていません。アドレスバー左の鍵（またはⓘ）のマーク →「権限」→「位置情報」を許可にしてから、もう一度押してください（端末の位置情報がオフのときはオンにしてください）。';
    return '位置情報が許可されていません。ブラウザのアドレスバーの鍵のマークから、このサイトの位置情報を許可してください。';
  }

  /** 現在地ボタン：押すと端末の位置を地図に表示（もう一度押すと止める）。位置はどこにも送らない */
  function addLocateControl(map: L.Map, lib: typeof L) {
    let watch: number | null = null;
    let dot: L.CircleMarker | null = null, ring: L.Circle | null = null, first = true;
    const Ctl = lib.Control.extend({
      onAdd() {
        const b = lib.DomUtil.create('button', 'locate-btn');
        b.type = 'button'; b.textContent = cbRef.current.lang === 'en' ? '📍 My location' : '📍 現在地'; b.title = cbRef.current.lang === 'en' ? 'Show my location (never sent or saved)' : '現在地を表示（位置は送信・保存されません）';
        lib.DomEvent.disableClickPropagation(b);
        // 地図の外の大きなボタン（EventLive）からも押せるようにし、状態・うまくいかない理由を知らせる
        const tell = (on: boolean, error = '', far = 0) => window.dispatchEvent(new CustomEvent('evenow:locate-state', { detail: { on, error, far } }));
        let last: L.LatLng | null = null;
        window.addEventListener('evenow:home', () => homeRef.current?.());
        window.addEventListener('evenow:show-me', () => { if (last) map.setView(last, 16); });
        const stop = () => {
          if (watch != null) navigator.geolocation.clearWatch(watch);
          watch = null; dot?.remove(); ring?.remove(); dot = ring = null; first = true;
          window.dispatchEvent(new CustomEvent('evenow:me', { detail: null }));
          b.classList.remove('on');
        };
        const W = window as unknown as { __evenowWantLocate?: boolean };
        window.addEventListener('evenow:locate', () => { W.__evenowWantLocate = false; b.click(); });
        // 地図の読み込み前に「近い順にする」が押されていたら、読み込めた時点で始める
        if (W.__evenowWantLocate) { W.__evenowWantLocate = false; setTimeout(() => b.click(), 0); }
        b.onclick = () => {
          if (watch != null) { stop(); tell(false); return; }
          if (!('geolocation' in navigator)) { tell(false, locateHelp('unsupported')); return; }
          b.classList.add('on'); tell(true);
          watch = navigator.geolocation.watchPosition((pos) => {
            const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            if (!dot) {
              ring = lib.circle(ll, { radius: pos.coords.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
              dot = lib.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(map);
            } else { dot.setLatLng(ll); ring!.setLatLng(ll).setRadius(pos.coords.accuracy); }
            last = lib.latLng(ll);
            window.dispatchEvent(new CustomEvent('evenow:me', { detail: ll })); // 一覧を「自分から近い順」にする（画面の中だけ）
            if (first) {
              first = false;
              // 自動で始めたとき（位置情報が許可済み）は地図を動かさない
              const W = window as unknown as { __evenowQuiet?: boolean };
              if (W.__evenowQuiet) { W.__evenowQuiet = false; tell(true); return; }
              const venue = venueRef.current;
              const d = venue ? map.distance(last, venue) : 0;
              // 会場から遠い（3km超）ときは地図を会場のままにして、距離と道順を案内する（遠くの自分の位置へ飛ばない）
              if (venue && d > FAR_M) { tell(true, '', d); return; }
              // 会場の近くなら、会場と自分の両方が入るように表示
              map.fitBounds(lib.latLngBounds([last, ...(venue ? [venue] : [])]).pad(0.3), { maxZoom: 17 });
              tell(true);
            }
          }, (err) => {
            stop();
            tell(false, locateHelp(err.code === 1 ? 'denied' : 'failed'));
          }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
        };
        return b;
      },
    });
    new Ctl({ position: 'topright' }).addTo(map);
    const Home = lib.Control.extend({
      onAdd() {
        const b = lib.DomUtil.create('button', 'locate-btn home-btn');
        b.type = 'button'; b.textContent = cbRef.current.lang === 'en' ? '🎪 Venue' : '🎪 会場へ'; b.title = cbRef.current.lang === 'en' ? 'Back to the venue' : '会場の表示に戻る';
        lib.DomEvent.disableClickPropagation(b);
        b.onclick = () => homeRef.current?.();
        return b;
      },
    });
    new Home({ position: 'topright' }).addTo(map);
  }

  function renderShapes() {
    const lib = libRef.current, layer = shapeLayer.current;
    if (!lib || !layer) return;
    layer.clearLayers();
    for (const s of cbRef.current.shapes ?? []) {
      if (s.coords.length < 2) continue;
      const st = shapeStyle(s.style);
      const common = { color: st.color, weight: s.kind === 'line' ? 5 : 2, dashArray: st.dashed ? '8 6' : undefined, interactive: false };
      const layerShape = s.kind === 'area'
        ? lib.polygon(s.coords, s.style === 'venue' ? { ...common, weight: 2, opacity: 0.55, fillColor: st.color, fillOpacity: 0.06 } : { ...common, fillColor: st.color, fillOpacity: 0.18 })
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
