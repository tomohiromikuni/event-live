import 'server-only';
import type { Q } from './db';
import { distanceM } from './osm';

/**
 * 会場の範囲（公園・広場などの外形）を OpenStreetMap（Nominatim）から取り、地図に薄く囲って表示する。
 * 名前で探し、会場の位置から 1.5km 以内・広すぎない（3km²未満）ものだけを使う。見つからなければ何もしない（推測で囲まない）。
 * データ © OpenStreetMap contributors（ODbL）。1回のイベントにつき1回だけ問い合わせる（Nominatim の利用ルールを守る）。
 */
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;
type Geo = [number, number];

function ringOf(g: { type: string; coordinates: unknown }): Geo[] | null {
  // GeoJSON は [経度, 緯度]。いちばん大きい外周だけを使う
  const rings: [number, number][][] = g.type === 'Polygon' ? [(g.coordinates as [number, number][][])[0]]
    : g.type === 'MultiPolygon' ? (g.coordinates as [number, number][][][]).map((p) => p[0]) : [];
  const ring = rings.sort((a, b) => b.length - a.length)[0];
  if (!ring || ring.length < 4) return null;
  const step = Math.max(1, Math.ceil(ring.length / 80)); // 点を80個くらいまで間引く
  return ring.filter((_, i) => i % step === 0).map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)]);
}

function areaM2(ring: Geo[]): number {
  const lat0 = ring[0][0] * Math.PI / 180, k = 111_320;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i], [y2, x2] = ring[(i + 1) % ring.length];
    a += (x1 * Math.cos(lat0) * k) * (y2 * k) - (x2 * Math.cos(lat0) * k) * (y1 * k);
  }
  return Math.abs(a / 2);
}

export async function importVenueArea(tq: Q, eventId: number): Promise<string> {
  const ev = (await tq<{ venue_name: string; city: string; prefecture: string; lat: number; lng: number; map_mode: string }>(
    'SELECT venue_name, city, prefecture, lat, lng, map_mode FROM events WHERE id = $1', [eventId]))[0];
  if (!ev || ev.map_mode !== 'geo' || !(ev.lat || ev.lng) || !ev.venue_name || !ev.city) return '';
  const [{ n }] = await tq<{ n: number }>("SELECT COUNT(*)::int AS n FROM map_shapes WHERE event_id = $1 AND style = 'venue'", [eventId]);
  if (n > 0) return '';
  const center: Geo = [ev.lat, ev.lng];
  const url = `${NOMINATIM}?format=jsonv2&polygon_geojson=1&countrycodes=jp&accept-language=ja&limit=5&q=${encodeURIComponent(`${ev.venue_name} ${ev.city}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return '';
  const hits = (await res.json().catch(() => [])) as { lat: string; lon: string; geojson?: { type: string; coordinates: unknown } }[];
  for (const h of hits) {
    if (!h.geojson) continue;
    const ring = ringOf(h.geojson);
    if (!ring) continue;
    const a = areaM2(ring);
    if (distanceM(center, [Number(h.lat), Number(h.lon)]) > 1500 || a < 300 || a > 3_000_000) continue;
    await tq("INSERT INTO map_shapes (event_id, kind, style, label, coords, sort) VALUES ($1, 'area', 'venue', '会場', $2, -1)", [eventId, JSON.stringify(ring)]);
    return '会場の範囲を地図に囲いました（OpenStreetMap）';
  }
  return '';
}
