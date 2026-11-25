import 'server-only';
import type { Q } from './db';

/**
 * 会場マップの自動作成（第1段階）：会場の周りにある「常設の」トイレ・駐車場を OpenStreetMap から取り込む。
 * - 会場の位置：住所 → 国土地理院の地名検索（無料）で緯度経度にする
 * - 施設：OpenStreetMap（Overpass API・無料。出典「© OpenStreetMap contributors」を表示）
 * 仮設トイレ・臨時駐車場は OSM に無いので、ここでは取り込めない（第2段階でガイドマップから推定する予定）。
 * 人の手での位置合わせはしない。名前が無い施設は「会場から北へ約200m」のように方角と距離で呼ぶ。
 */
const GSI_SEARCH = process.env.GSI_SEARCH_URL || 'https://msearch.gsi.go.jp/address-search/AddressSearch';
// Overpass API はよく混雑するので、だめなら別のサーバーで試す（どれも無料の公開サーバー）
const OVERPASS = process.env.OSM_OVERPASS_URL ? [process.env.OSM_OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;

export const RADIUS_M = 700;       // 会場の中心からこの範囲
const MAX = { toilet: 8, parking: 6 };

type Geo = [number, number];

/** 住所・会場名から緯度経度を求める（見つからなければ null。推測はしない） */
export async function geocode(e: { prefecture: string; city: string; venue_name: string; address: string }): Promise<Geo | null> {
  const queries = [e.address, e.venue_name && `${e.prefecture}${e.city}${e.venue_name}`, e.venue_name].filter((x): x is string => !!x && x.length >= 2);
  for (const q of queries) {
    try {
      const res = await fetch(`${GSI_SEARCH}?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!res.ok) continue;
      const hits = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
      // 同じ名前が全国にある場合があるので、都道府県が一致するものだけを使う
      const hit = hits.find((h) => !e.prefecture || h.properties.title.startsWith(e.prefecture));
      if (hit) return [hit.geometry.coordinates[1], hit.geometry.coordinates[0]];
    } catch { /* 次の候補で試す */ }
  }
  return null;
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export type Facility = { cat: 'toilet' | 'parking'; extId: string; name: string; note: string; lat: number; lng: number; dist: number };

export function distanceM(a: Geo, b: Geo) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function direction(from: Geo, to: Geo) {
  const dy = to[0] - from[0], dx = (to[1] - from[1]) * Math.cos(from[0] * Math.PI / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(((deg + 360) % 360) / 45) % 8];
}
const roundDist = (m: number) => (m < 100 ? '100m以内' : `約${Math.round(m / 50) * 50}m`);

/** 会場の周りの常設トイレ・駐車場を OSM から取る（距離の近い順・種類ごとに上限あり） */
export async function fetchFacilities(center: Geo): Promise<Facility[]> {
  const [lat, lng] = center;
  const around = `(around:${RADIUS_M},${lat},${lng})`;
  const query = `[out:json][timeout:25];(nwr${around}[amenity=toilets];nwr${around}[amenity=parking];);out center tags;`;
  let els: OsmEl[] | null = null;
  let lastStatus = 0;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(10000), cache: 'no-store',
      });
      if (!res.ok) { lastStatus = res.status; continue; }
      els = ((await res.json()) as { elements: OsmEl[] }).elements ?? [];
      break;
    } catch { lastStatus = 0; }
  }
  if (!els) throw new Error(`OpenStreetMap からの取得に失敗しました（${lastStatus || '接続できません'}）`);
  const out: Facility[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const p: Geo | null = el.lat != null ? [el.lat, el.lon!] : el.center ? [el.center.lat, el.center.lon] : null;
    if (!p) continue;
    const cat = t.amenity === 'toilets' ? 'toilet' : t.amenity === 'parking' ? 'parking' : null;
    if (!cat) continue;
    // 一般の人が使えないもの（関係者用・店の客専用など）は除く
    if (['private', 'no', 'customers', 'permissive_members', 'staff', 'delivery'].includes(t.access ?? '')) continue;
    if (cat === 'parking' && ['street_side', 'lane'].includes(t.parking ?? '')) continue;
    const dist = distanceM(center, p);
    const where = `会場から${direction(center, p)}へ${roundDist(dist)}`;
    const name = (t['name:ja'] || t.name || '').trim();
    const notes = [
      cat === 'parking' && t.fee === 'yes' ? '有料' : cat === 'parking' && t.fee === 'no' ? '無料' : '',
      cat === 'parking' && /^\d+$/.test(t.capacity ?? '') ? `約${t.capacity}台` : '',
      cat === 'toilet' && t.wheelchair === 'yes' ? '車いす対応' : '',
      name ? where : '',
    ].filter(Boolean);
    out.push({
      cat, extId: `${el.type}/${el.id}`, dist, lat: p[0], lng: p[1],
      name: (name ? name : `${cat === 'toilet' ? 'トイレ' : '駐車場'}（${where}）`).slice(0, 60),
      note: notes.join('・').slice(0, 100),
    });
  }
  // 種類ごとに近い順で上限まで
  const pick = (cat: 'toilet' | 'parking') => out.filter((f) => f.cat === cat).sort((a, b) => a.dist - b.dist).slice(0, MAX[cat]);
  return [...pick('toilet'), ...pick('parking')];
}

export type OsmImportResult = { ok: boolean; message: string; added?: number };

/**
 * イベントに取り込む。見取り図（手で描いた図面）のイベントには混ぜない。
 * かんたん表示のイベントは「地図」表示に切り替え、シャトルバス・飲食などの位置の無い項目はカードにそのまま残す。
 * 位置の無い「トイレ」「駐車場（周辺）」の項目は、まだ投稿が無ければ外す（実際の場所に置き換わるため）。
 */
export async function importOsmFacilities(tq: Q, eventId: number): Promise<OsmImportResult> {
  const ev = (await tq<{ id: number; prefecture: string; city: string; venue_name: string; address: string; lat: number; lng: number; map_mode: string }>(
    'SELECT id, prefecture, city, venue_name, address, lat, lng, map_mode FROM events WHERE id = $1', [eventId]))[0];
  if (!ev) return { ok: false, message: 'イベントが見つかりません' };
  if (ev.map_mode === 'canvas') {
    const [{ n }] = await tq<{ n: number }>('SELECT COUNT(*)::int AS n FROM spots WHERE event_id = $1 AND generic = 0', [eventId]);
    if (n > 0) return { ok: false, message: '見取り図で描いたマップがあるため、自動取得は行いません' };
  }
  let center: Geo | null = ev.lat || ev.lng ? [ev.lat, ev.lng] : null;
  if (!center) {
    center = await geocode(ev);
    if (!center) return { ok: false, message: '会場の位置が分かりませんでした（住所か会場名を確認してください）' };
    await tq('UPDATE events SET lat = $1, lng = $2 WHERE id = $3', [center[0], center[1], eventId]);
  }
  const found = await fetchFacilities(center);
  if (found.length === 0) return { ok: true, added: 0, message: `会場の周り（${RADIUS_M}m以内）に、OpenStreetMap に登録されたトイレ・駐車場はありませんでした` };

  const cats = new Map((await tq<{ id: number; slug: string }>("SELECT id, slug FROM spot_categories WHERE slug IN ('toilet', 'parking')")).map((c) => [c.slug, c.id]));
  const have = new Set((await tq<{ ext_id: string }>("SELECT ext_id FROM spots WHERE event_id = $1 AND source = 'osm'", [eventId])).map((r) => r.ext_id));
  let added = 0;
  for (const [i, f] of found.entries()) {
    if (have.has(f.extId)) continue;
    await tq(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic, source, ext_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'osm', $8)`, [eventId, cats.get(f.cat)!, f.name, f.note, f.lat, f.lng, 100 + i, f.extId]);
    added++;
  }
  // 位置の無い汎用の「トイレ」「駐車場」項目は、投稿が無ければ外す（実際の場所に置き換え）
  for (const cat of new Set(found.map((f) => f.cat))) {
    await tq(`DELETE FROM spots s WHERE s.event_id = $1 AND s.generic = 1 AND s.category_id = $2
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.spot_id = s.id)`, [eventId, cats.get(cat)!]);
  }
  // 地図として表示（背景は国土地理院の地図）
  if (ev.map_mode !== 'geo') await tq("UPDATE events SET map_mode = 'geo' WHERE id = $1", [eventId]);
  // カテゴリがイベント個別の設定で隠れないようにする
  const own = await tq<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eventId]);
  if (own.length) for (const c of cats.values()) await tq('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, c]);
  const nT = found.filter((f) => f.cat === 'toilet').length, nP = found.filter((f) => f.cat === 'parking').length;
  return { ok: true, added, message: `OpenStreetMap から トイレ ${nT}件・駐車場 ${nP}件 を見つけました（新しく追加 ${added}件）` };
}
