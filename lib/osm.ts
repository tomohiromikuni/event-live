import 'server-only';
import type { Q } from './db';
import { cityFromAddress } from './infoText';

/**
 * 会場マップの自動作成（第1段階）：会場の周りにある「常設の」トイレ・駐車場を OpenStreetMap から取り込む。
 * - 会場の位置：住所 → 国土地理院の地名検索（無料）で緯度経度にする
 * - 施設：OpenStreetMap（月1回作り直す自前の抽出データ。無いときは Overpass API。無料。出典「© OpenStreetMap contributors」を表示）
 * 仮設トイレ・臨時駐車場は OSM に無いので、ここでは取り込めない（第2段階でガイドマップから推定する予定）。
 * 人の手での位置合わせはしない。名前が無い施設は「会場から北へ約200m」のように方角と距離で呼ぶ。
 */
const GSI_SEARCH = process.env.GSI_SEARCH_URL || 'https://msearch.gsi.go.jp/address-search/AddressSearch';
// Overpass API はよく混雑するので、だめなら別のサーバーで試す（どれも無料の公開サーバー）
const OVERPASS = process.env.OSM_OVERPASS_URL ? [process.env.OSM_OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;

export const RADIUS_M = 700;       // 会場の中心からこの範囲
/** 700m以内に1つも無い種類（トイレ・駐車場）だけ、ここまで広げて近い順に探す */
export const WIDE_M = 1500;
const MAX = { toilet: 8, parking: 6 };

type Geo = [number, number];

/** 住所・会場名から緯度経度を求める（見つからなければ null。推測はしない） */
export async function geocode(e: { prefecture: string; city: string; venue_name: string; address: string }): Promise<Geo | null> {
  // 市区町村が分からないと、同じ名前の別の場所（例：札幌の「にぎわい広場」）を拾ってしまうので、位置を決めない
  const city = (e.city || cityFromAddress(e.address)).trim();
  if (!city) return null;
  const queries = [e.address, e.venue_name && `${e.prefecture}${e.city || city}${e.venue_name}`].filter((x): x is string => !!x && x.length >= 2);
  for (const q of queries) {
    try {
      const res = await fetch(`${GSI_SEARCH}?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!res.ok) continue;
      const hits = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
      // 同じ名前が全国にある場合があるので、都道府県が一致するものだけを使う
      // 都道府県と市区町村が一致するものだけを使う（同じ名前が全国にあるため）
      const hit = hits.find((h) => (!e.prefecture || h.properties.title.startsWith(e.prefecture)) && h.properties.title.includes(city));
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

/**
 * 日本全国の OpenStreetMap から抜き出したトイレ・駐車場（0.1度ごとのファイル）。
 * .github/workflows/osm-data.yml が月1回作り直して osm-data ブランチに置く。© OpenStreetMap contributors（ODbL）
 */
export const TILES_BASE = process.env.OSM_TILES_URL || 'https://raw.githubusercontent.com/tomohiromikuni/event-live/osm-data';
type TileExtra = { k?: string; o?: string; a?: number; l?: number; c?: number; x?: number };
type TileRow = [string, number, number, number, string?, string?, string?, string?, TileExtra?];

/** 点から多角形（会場の範囲）までの距離（中なら0）。おおよそ（頂点と辺までの最短） */
export function distToRing(p: Geo, ring: Geo[]): number {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return 0;
  const k = Math.cos(p[0] * Math.PI / 180);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 111_000);
  }
  return best;
}
/** 会場の範囲から、この距離までを探す（範囲が分かるとき） */
export const RING_MARGIN_M = 300;

async function fromTiles(center: Geo, ring?: Geo[]): Promise<OsmEl[] | null> {
  const get = async (path: string) => {
    const res = await fetch(`${TILES_BASE}/${path}`, { signal: AbortSignal.timeout(8000), next: { revalidate: path === 'meta.json' ? 3600 : 86400 } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`tiles ${res.status}`);
    return res.json();
  };
  const meta = (await get('meta.json')) as { tiles: string[] } | null;
  if (!meta?.tiles?.length) return null; // データがまだ無い → Overpass で取る
  const have = new Set(meta.tiles);
  const [lat, lng] = center;
  // 探す四角：会場の範囲が分かればその外側300mまで、無ければ中心から1.5km
  const pts: Geo[] = ring?.length ? ring : [center];
  const m = ring?.length ? RING_MARGIN_M : WIDE_M;
  const dLat = m / 111_000, dLng = m / (111_000 * Math.cos(lat * Math.PI / 180));
  const la0 = Math.min(...pts.map((p) => p[0])) - dLat, la1 = Math.max(...pts.map((p) => p[0])) + dLat;
  const lo0 = Math.min(...pts.map((p) => p[1])) - dLng, lo1 = Math.max(...pts.map((p) => p[1])) + dLng;
  const keys = new Set<string>();
  for (let a = Math.floor(la0 * 10); a <= Math.floor(la1 * 10); a++) for (let b = Math.floor(lo0 * 10); b <= Math.floor(lo1 * 10); b++) keys.add(`${a}_${b}`);
  const rows: TileRow[] = [];
  for (const k of keys) if (have.has(k)) rows.push(...((await get(`t/${k}.json`)) as TileRow[] ?? []));
  const TYPES: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };
  return rows
    .filter((r) => (ring?.length ? distToRing([r[2], r[3]], ring) <= RING_MARGIN_M : distanceM(center, [r[2], r[3]]) <= WIDE_M))
    .map(([k, id, la, lo, name = '', fee = '', capacity = '', wheelchair = '', x = {}]) => {
      const ex = (x || {}) as TileExtra;
      const tags: Record<string, string> = { amenity: k[0] === 't' ? 'toilets' : 'parking' };
      if (name) tags.name = name;
      if (fee) tags.fee = fee;
      if (capacity) tags.capacity = capacity;
      if (wheelchair) tags.wheelchair = wheelchair;
      if (ex.k) tags.parking = { m: 'multi-storey', u: 'underground', s: 'surface' }[ex.k] ?? '';
      if (ex.o) tags.operator = ex.o;
      if (ex.a) tags['x:area'] = String(ex.a);
      if (ex.l) tags['building:levels'] = String(ex.l);
      if (ex.c) tags.changing_table = 'yes';
      if (ex.x) tags.unisex = 'yes';
      return { type: TYPES[k[1]] ?? 'node', id, lat: la, lon: lo, tags };
    });
}

/** 会場の周りの常設トイレ・駐車場を OSM から取る（距離の近い順・種類ごとに上限あり） */
export async function fetchFacilities(center: Geo, o: { patient?: boolean; ring?: Geo[] } = {}): Promise<Facility[]> {
  const [lat, lng] = center;
  // 1回の検索で済ませ、サーバーの負担を軽くする（混んでいても通りやすくするため）
  const query = `[out:json][timeout:20];nwr(around:${WIDE_M},${lat},${lng})[amenity~"^(toilets|parking)$"];out center tags;`;
  // まず自前の抽出データ（月1回作り直す・osm-data ブランチ）から読む。読めなかったときだけ公開の Overpass サーバーに問い合わせる
  let els: OsmEl[] | null = await fromTiles(center, o.ring).catch(() => null);
  const errs: string[] = [];
  // 最初のサーバーは少し長めに待つ（公開サーバーは混んでいると10秒以上かかることがあるため）。やり直し専用の実行（patient）では長めに待つ
  for (const [i, url] of (els ? [] : OVERPASS).entries()) {
    const host = new URL(url).hostname;
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(o.patient ? (i === 0 ? 20000 : 10000) : (i === 0 ? 10000 : 5000)), cache: 'no-store',
      });
      if (!res.ok) { errs.push(`${host}:${res.status}`); continue; }
      els = ((await res.json()) as { elements: OsmEl[] }).elements ?? [];
      break;
    } catch (e) {
      const name = e instanceof Error ? (e.name === 'TimeoutError' || e.name === 'AbortError' ? '時間切れ' : (e.cause as { code?: string })?.code || e.message) : String(e);
      errs.push(`${host}:${name}`);
    }
  }
  // 原因が分かるよう、サーバーごとの結果を残す（「接続できません」の文言は翌日の再試行の判定にも使う）
  if (!els) throw new Error(`OpenStreetMap からの取得に失敗しました（接続できません：${errs.join('、')}）`);
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
    const notes = cat === 'parking' ? [
      { 'multi-storey': '立体', underground: '地下', surface: '平面' }[t.parking ?? ''] ?? '',
      t.fee === 'yes' ? '有料' : t.fee === 'no' ? '無料' : '',
      parkingScale(t),
      (t.operator ?? '').slice(0, 20),
      name ? where : '',
    ] : [
      t.wheelchair === 'yes' ? '車いす対応' : '',
      t.changing_table === 'yes' ? 'おむつ替え台' : '',
      t.unisex === 'yes' ? '男女共用' : '',
      name ? where : '',
    ];
    const dRing = o.ring?.length ? distToRing(p, o.ring) : dist;
    out.push({
      cat, extId: `${el.type}/${el.id}`, dist: dRing, lat: p[0], lng: p[1],
      name: (name ? name : `${cat === 'toilet' ? 'トイレ' : '駐車場'}（${where}）`).slice(0, 60),
      note: notes.filter(Boolean).join('・').slice(0, 100),
    });
  }
  // 種類ごとに近い順で上限まで
  // 700m以内にあればその中から。1つも無い種類だけ、1.5km以内の近いものを出す（無い場所を推測で埋めない）
  // 会場の範囲が分かるときは、範囲の周りから最大12か所を、端から端までばらけるように選ぶ
  const pick = (cat: 'toilet' | 'parking') => {
    const all = out.filter((f) => f.cat === cat).sort((a, b) => a.dist - b.dist);
    if (o.ring?.length) return spread(all, 12);
    const near = all.filter((f) => f.dist <= RADIUS_M);
    return (near.length ? near : all).slice(0, MAX[cat]);
  };
  return [...pick('toilet'), ...pick('parking')];
}

/** 駐車場の規模の目安（台数が書かれていればそれ、無ければ地図上の広さ×階数から。1台あたり約30m²） */
function parkingScale(t: Record<string, string>): string {
  const cap = /^\d+$/.test(t.capacity ?? '') ? Number(t.capacity) : 0;
  const est = cap || (Number(t['x:area'] ?? 0) * Math.max(1, Number(t['building:levels'] ?? 1))) / 30;
  if (!est) return '';
  const size = est >= 150 ? '大' : est >= 30 ? '中' : '小';
  return cap ? `規模：${size}（約${cap}台）` : `規模：${size}（目安）`;
}

/** 近いものから順に、すでに選んだものと離れているものを選ぶ（同じ場所に固まらないように） */
function spread(list: Facility[], n: number): Facility[] {
  if (list.length <= n) return list;
  const chosen: Facility[] = [list[0]];
  while (chosen.length < n) {
    let best: Facility | null = null, bestD = -1;
    for (const f of list) {
      if (chosen.includes(f)) continue;
      const d = Math.min(...chosen.map((c) => distanceM([c.lat, c.lng], [f.lat, f.lng]))) - f.dist * 0.5;
      if (d > bestD) { bestD = d; best = f; }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

export type OsmImportResult = { ok: boolean; message: string; added?: number };

/**
 * イベントに取り込む。見取り図（手で描いた図面）のイベントには混ぜない。
 * かんたん表示のイベントは「地図」表示に切り替え、シャトルバス・飲食などの位置の無い項目はカードにそのまま残す。
 * 位置の無い「トイレ」「駐車場（周辺）」の項目は、まだ投稿が無ければ外す（実際の場所に置き換わるため）。
 */
export async function importOsmFacilities(tq: Q, eventId: number, o: { patient?: boolean } = {}): Promise<OsmImportResult> {
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
  // 会場の範囲（薄い点線）が分かれば、その周りから探す
  const venue = (await tq<{ coords: string }>("SELECT coords FROM map_shapes WHERE event_id = $1 AND style = 'venue' LIMIT 1", [eventId]))[0];
  const ring = venue ? (JSON.parse(venue.coords) as Geo[]) : undefined;
  let found: Facility[];
  try { found = await fetchFacilities(center, { ...o, ring }); } catch (e) {
    // つながらなかった：1時間ごとのやり直し（/api/cron/osm-retry）の対象にする
    await tq('UPDATE events SET osm_pending = 1 WHERE id = $1', [eventId]);
    throw e;
  }
  await tq('UPDATE events SET osm_pending = 0 WHERE id = $1', [eventId]);
  if (found.length === 0) return { ok: true, added: 0, message: `会場の周り（${WIDE_M / 1000}km以内）に、OpenStreetMap に登録されたトイレ・駐車場はありませんでした` };

  const cats = new Map((await tq<{ id: number; slug: string }>("SELECT id, slug FROM spot_categories WHERE slug IN ('toilet', 'parking')")).map((c) => [c.slug, c.id]));
  const have = new Set((await tq<{ ext_id: string }>("SELECT ext_id FROM spots WHERE event_id = $1 AND source = 'osm'", [eventId])).map((r) => r.ext_id));
  let added = 0;
  for (const [i, f] of found.entries()) {
    // すでにある施設は、説明（種類・有料無料・規模・設備）を新しい情報で更新する
    if (have.has(f.extId)) { await tq("UPDATE spots SET note = $1 WHERE event_id = $2 AND source = 'osm' AND ext_id = $3", [f.note, eventId, f.extId]); continue; }
    await tq(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic, source, ext_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'osm', $8)`, [eventId, cats.get(f.cat)!, f.name, f.note, f.lat, f.lng, 100 + i, f.extId]);
    added++;
  }
  // 位置の無い汎用の「トイレ」「駐車場」項目は、投稿が無ければ外す（実際の場所に置き換え）
  for (const cat of new Set(found.map((f) => f.cat))) {
    await tq(`DELETE FROM spots s WHERE s.event_id = $1 AND s.generic = 1 AND s.source = '' AND s.category_id = $2
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
