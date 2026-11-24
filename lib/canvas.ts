import type { Q } from './db';

/**
 * 会場マップの「見取り図」座標系。
 * 横幅 CANVAS_W を基準に、縦はガイドマップ画像の比率に合わせる。
 * 地図ライブラリ（Leaflet の CRS.Simple）では [y, x] の順で扱い、y は下から上へ増える。
 */
export const CANVAS_W = 1000;
export const DEFAULT_CANVAS_H = 700;

/**
 * 緯度経度で登録されていた施設・エリアを、見取り図の座標へ変換する（v3 マイグレーション・サンプル投入で使用）。
 * 全体を囲む範囲を求め、余白をとって CANVAS_W 幅に収める。
 */
export async function convertEventToCanvas(q: Q, eventId: number) {
  const spots = await q<{ id: number; lat: number; lng: number }>('SELECT id, lat, lng FROM spots WHERE event_id = $1', [eventId]);
  const shapes = await q<{ id: number; coords: string }>('SELECT id, coords FROM map_shapes WHERE event_id = $1', [eventId]);
  const pts: [number, number][] = [...spots.map((s) => [s.lat, s.lng] as [number, number]), ...shapes.flatMap((s) => JSON.parse(s.coords) as [number, number][])];
  if (pts.length === 0) return;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180); // 経度方向の縮み補正
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
  const margin = 100; // 上下左右の余白
  const scale = Math.min((CANVAS_W - 2 * margin) / spanX, (1600 - 2 * margin) / spanY);
  const h = Math.round(Math.max(spanY * scale + 2 * margin, 400));
  const offX = (CANVAS_W - spanX * scale) / 2, offY = (h - spanY * scale) / 2;
  const conv = (lat: number, lng: number): [number, number] =>
    [+((lat - minLat) * scale + offY).toFixed(1), +((lng - minLng) * kx * scale + offX).toFixed(1)];
  for (const s of spots) {
    const [y, x] = conv(s.lat, s.lng);
    await q('UPDATE spots SET lat = $1, lng = $2 WHERE id = $3', [y, x, s.id]);
  }
  for (const s of shapes) {
    const c = (JSON.parse(s.coords) as [number, number][]).map(([a, b]) => conv(a, b));
    await q('UPDATE map_shapes SET coords = $1 WHERE id = $2', [JSON.stringify(c), s.id]);
  }
  await q('UPDATE events SET map_w = $1, map_h = $2 WHERE id = $3', [CANVAS_W, h, eventId]);
}
