import 'server-only';
import type { Q } from './db';
import { distanceM, TILES_BASE } from './osm';

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

/** 点が多角形の中にあるか（緯度経度のまま判定） */
function inside(pt: Geo, ring: Geo[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const norm = (s: string) => s.normalize('NFKC').replace(/[\s・()（）「」]/g, '').replace(/(会場|特設会場|周辺|一帯)$/, '');

/**
 * 月1回作る抽出データ（osm-data ブランチの a/）から、会場の位置を含む公園・広場などを探す。
 * 見つからなければ、会場名と名前が一致する近くの場所（1.5km以内）。
 */
async function fromAreaTiles(center: Geo, venueName: string): Promise<Geo[] | null> {
  const get = async (path: string) => {
    const res = await fetch(`${TILES_BASE}/${path}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    return res.ok ? res.json() : null;
  };
  // 一覧（meta.json）は月1回しか変わらないが、作り直した直後に古い一覧を使わないよう1時間で読み直す
  const res = await fetch(`${TILES_BASE}/meta.json?areas`, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }).catch(() => null);
  const meta = (res?.ok ? await res.json() : null) as { area_tiles?: string[] } | null;
  if (!meta?.area_tiles?.length) return null;
  const have = new Set(meta.area_tiles);
  const [la, lo] = [Math.floor(center[0] * 10), Math.floor(center[1] * 10)];
  const rows: [string, string, number, Geo[]][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const k = `${la + dy}_${lo + dx}`;
    if (have.has(k)) rows.push(...(((await get(`a/${k}.json`).catch(() => null)) ?? []) as [string, string, number, Geo[]][]));
  }
  const containing = rows.filter((r) => inside(center, r[3])).sort((a, b) => a[2] - b[2]);
  if (containing.length) return containing[0][3];
  const v = norm(venueName);
  if (v.length >= 2) {
    const named = rows.filter((r) => r[1] && (norm(r[1]).includes(v) || v.includes(norm(r[1]))))
      .map((r) => ({ r, d: distanceM(center, [r[3].reduce((s, p) => s + p[0], 0) / r[3].length, r[3].reduce((s, p) => s + p[1], 0) / r[3].length]) }))
      .filter((x) => x.d <= 1500).sort((a, b) => a.d - b.d);
    if (named.length) return named[0].r[3];
  }
  return null;
}

export async function importVenueArea(tq: Q, eventId: number): Promise<string> {
  const ev = (await tq<{ venue_name: string; city: string; prefecture: string; lat: number; lng: number; map_mode: string }>(
    'SELECT venue_name, city, prefecture, lat, lng, map_mode FROM events WHERE id = $1', [eventId]))[0];
  if (!ev || ev.map_mode !== 'geo' || !(ev.lat || ev.lng)) return '';
  const [{ n }] = await tq<{ n: number }>("SELECT COUNT(*)::int AS n FROM map_shapes WHERE event_id = $1 AND style = 'venue'", [eventId]);
  if (n > 0) return '';
  const center: Geo = [ev.lat, ev.lng];
  const fromTiles = await fromAreaTiles(center, ev.venue_name).catch(() => null);
  if (fromTiles) {
    await tq("INSERT INTO map_shapes (event_id, kind, style, label, coords, sort) VALUES ($1, 'area', 'venue', '会場', $2, -1)", [eventId, JSON.stringify(fromTiles)]);
    return '会場の範囲を地図に囲いました（OpenStreetMap）';
  }
  if (!ev.venue_name || !ev.city) return '';
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
