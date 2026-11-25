import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { Q } from './db';
import { fetchBinary, fetchHtml } from './collect/web';
import { collectModel, extractorReady } from './collect/extract';
import { distanceM, geocode } from './osm';

/**
 * 会場マップの自動作成（第2段階）：公式サイトのガイドマップから、仮設トイレ・臨時駐車場・シャトルバス乗り場などを「目安」として追加する。
 * 人の手での位置合わせはしない：
 *  1) 公式ページからガイドマップらしい画像を探す（robots.txt を守る。画像はメモリ上で使うだけで、保存・公開しない）
 *  2) AI が画像から「施設の位置（画像上の%）」と「地図に名前が書かれた目印（駅・橋・交差点・学校など）」を読み取る
 *  3) 目印の実際の位置を地名検索で調べ、画像 → 実際の地図 の対応（拡大・回転・移動）を計算する
 *  4) 目印どうしの食い違い（誤差）が大きいときは採用しない。小さければ施設を「目安」として地図に置く
 * 取り出すのは「どこに何があるか」という事実だけ。ガイドマップの絵柄・形は使わない。
 */
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;
const MAX_IMAGES = 2;
const TIME_BUDGET_MS = 40_000; // 1回の処理時間の目安（Vercel の実行時間の上限に収める）
export const MAX_RMS_M = 80;      // 目安として採用する誤差の上限（目印の平均的な食い違い）
const MAX_ONE_M = 150;            // 目印1つあたりの食い違いの上限
const NEAR_M = 40;                // すでにある同じ種類の施設とこれより近ければ、同じものとみなして追加しない

type Cat = 'toilet' | 'parking' | 'shuttle' | 'food' | 'first_aid' | 'gate';
type Pt = { x: number; y: number };
export type GuideRead = {
  is_venue_map: boolean;
  facilities: (Pt & { category: Cat; label: string })[];
  landmarks: (Pt & { name: string })[];
};

const pct = { type: 'number', minimum: 0, maximum: 100 };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['is_venue_map', 'facilities', 'landmarks'],
  properties: {
    is_venue_map: { type: 'boolean' },
    facilities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['category', 'label', 'x', 'y'],
      properties: { category: { type: 'string', enum: ['toilet', 'parking', 'shuttle', 'food', 'first_aid', 'gate'] }, label: { type: 'string' }, x: pct, y: pct } } },
    landmarks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'x', 'y'],
      properties: { name: { type: 'string' }, x: pct, y: pct } } },
  },
} as const;

const SYSTEM = `あなたはイベントの会場案内図（ガイドマップ）から、施設の位置を読み取る担当です。JSONで返します。
- is_venue_map: 会場や周辺の位置関係を示す地図・案内図なら true。ポスター・写真・ロゴ・時刻表など地図でなければ false（その場合は配列を空に）。
- facilities: 図に描かれている施設のうち、トイレ(toilet)・駐車場(parking)・シャトルバス乗り場(shuttle)・飲食/屋台エリア(food)・救護所(first_aid)・入口/ゲート(gate)。
  x, y は画像の左上を (0,0)、右下を (100,100) としたときの、その施設のアイコンや表示の中心（%）。label は図に書かれた名前を短く（無ければ種類名）。
- landmarks: 図に名前が書かれていて、一般の地図でも同じ名前で見つかる実在の場所（駅・橋・交差点・学校・公園・神社・公共施設・大きな建物など）。
  会場内だけの名前（第1会場・Aブロック・本部テントなど）や方角・矢印は含めない。名前は図の表記のまま。x, y は同じく%。
- 図に描かれていないもの・読み取れないものは書かない。推測で補わない。`;

let client: Anthropic | null = null;

/** 画像の縦横のピクセル数（PNG・JPEG・GIF・WebP の先頭から読む） */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** 公式ページの中から、ガイドマップらしい画像のURLを探す（名前・代替テキスト・リンク文字で判定） */
export function findMapImages(html: string, base: string): string[] {
  const KEY = /(map|マップ|会場|案内図|配置|レイアウト|周辺図|交通規制|駐車場|アクセス|access|guide|area)/i;
  const IMG = /\.(png|jpe?g|gif|webp)(\?|$)/i;
  const out: { url: string; score: number }[] = [];
  const add = (src: string, text: string) => {
    let url: string;
    try { url = new URL(src, base).toString(); } catch { return; }
    if (!/^https?:/.test(url) || !IMG.test(new URL(url).pathname)) return;
    if (/(logo|icon|banner|btn|button|sns|twitter|facebook|line|instagram|youtube|spacer)/i.test(url)) return;
    const score = (KEY.test(text) ? 2 : 0) + (KEY.test(url) ? 2 : 0);
    if (score > 0 && !out.some((o) => o.url === url)) out.push({ url, score });
  };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\s(?:data-src|src)=["']([^"']+)["']/i)?.[1];
    const text = [tag.match(/\salt=["']([^"']*)["']/i)?.[1], tag.match(/\stitle=["']([^"']*)["']/i)?.[1]].filter(Boolean).join(' ');
    if (src) add(src, text);
  }
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(m[1], m[2].replace(/<[^>]+>/g, ''));
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_IMAGES).map((o) => o.url);
}

async function readGuideMap(img: { type: string; data: Buffer }): Promise<GuideRead> {
  client ??= new Anthropic();
  const media = (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(img.type) ? img.type : 'image/png') as 'image/png';
  const res = await client.beta.messages.create({
    model: collectModel(),
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: media, data: img.data.toString('base64') } },
      { type: 'text', text: 'この画像を読み取ってください。' },
    ] }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  if (res.stop_reason === 'refusal') throw new Error('AIが処理を断りました');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(text) as GuideRead;
}

/** 目印の実際の位置：会場から3km以内で見つかったものだけ（同じ名前の遠くの場所を拾わない） */
async function locateLandmark(name: string, ev: { prefecture: string; city: string }, center: [number, number]): Promise<[number, number] | null> {
  const [lat, lng] = center, d = 0.03;
  try {
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim の利用ルール（1秒に1回まで）
    const url = `${NOMINATIM}?format=jsonv2&limit=3&accept-language=ja&bounded=1&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&q=${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (res.ok) {
      const hits = (await res.json()) as { lat: string; lon: string }[];
      const hit = hits.map((h) => [Number(h.lat), Number(h.lon)] as [number, number]).find((p) => distanceM(center, p) <= 3000);
      if (hit) return hit;
    }
  } catch { /* 地名検索で試す */ }
  const g = await geocode({ prefecture: ev.prefecture, city: ev.city, venue_name: name, address: '' });
  return g && distanceM(center, g) <= 3000 ? g : null;
}

/**
 * 画像上の点 → 実際の位置 の対応を計算（拡大・回転・移動。最小二乗）。
 * 返す err は目印ごとの食い違い（m）。目印が3つ以上で、食い違いが小さいときだけ使う。
 */
export function fitSimilarity(pairs: { px: number; py: number; lat: number; lng: number }[], center: [number, number]) {
  const k = Math.cos((center[0] * Math.PI) / 180);
  const toM = (lat: number, lng: number) => ({ re: (lng - center[1]) * 111320 * k, im: (lat - center[0]) * 110540 });
  const W = pairs.map((p) => ({ re: p.px, im: -p.py })); // 画像は下向きが＋なので反転
  const Z = pairs.map((p) => toM(p.lat, p.lng));
  const n = pairs.length;
  const wm = { re: W.reduce((a, w) => a + w.re, 0) / n, im: W.reduce((a, w) => a + w.im, 0) / n };
  const zm = { re: Z.reduce((a, z) => a + z.re, 0) / n, im: Z.reduce((a, z) => a + z.im, 0) / n };
  let numRe = 0, numIm = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const w = { re: W[i].re - wm.re, im: W[i].im - wm.im }, z = { re: Z[i].re - zm.re, im: Z[i].im - zm.im };
    numRe += z.re * w.re + z.im * w.im; numIm += z.im * w.re - z.re * w.im; den += w.re * w.re + w.im * w.im;
  }
  const a = { re: numRe / den, im: numIm / den };
  const b = { re: zm.re - (a.re * wm.re - a.im * wm.im), im: zm.im - (a.re * wm.im + a.im * wm.re) };
  const apply = (px: number, py: number): [number, number] => {
    const re = a.re * px - a.im * -py + b.re, im = a.re * -py + a.im * px + b.im;
    return [center[0] + im / 110540, center[1] + re / (111320 * k)];
  };
  const err = pairs.map((p) => distanceM(apply(p.px, p.py), [p.lat, p.lng]));
  const rms = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n);
  const metersPerPx = Math.hypot(a.re, a.im);
  return { apply, err, rms, metersPerPx };
}

const LABEL: Record<Cat, string> = { toilet: 'トイレ', parking: '駐車場', shuttle: 'シャトルバス乗り場', food: '飲食エリア', first_aid: '救護所', gate: '入口' };

export type GuideResult = { ok: boolean; message: string; added?: number };

/** 公式ページのガイドマップから施設を推定して追加する（見取り図で手描きしたイベントには混ぜない） */
export async function importGuideMap(tq: Q, eventId: number): Promise<GuideResult> {
  if (!extractorReady()) return { ok: false, message: 'ANTHROPIC_API_KEY が未設定のため、ガイドマップの読み取りはできません' };
  const ev = (await tq<{ prefecture: string; city: string; venue_name: string; address: string; lat: number; lng: number; map_mode: string; official_url: string; source_url: string }>(
    'SELECT prefecture, city, venue_name, address, lat, lng, map_mode, official_url, source_url FROM events WHERE id = $1', [eventId]))[0];
  if (!ev) return { ok: false, message: 'イベントが見つかりません' };
  if (ev.map_mode === 'canvas') {
    const [{ n }] = await tq<{ n: number }>('SELECT COUNT(*)::int AS n FROM spots WHERE event_id = $1 AND generic = 0', [eventId]);
    if (n > 0) return { ok: false, message: '見取り図で描いたマップがあるため、自動の推定は行いません' };
  }
  let center: [number, number] | null = ev.lat || ev.lng ? [ev.lat, ev.lng] : null;
  if (!center) {
    center = await geocode(ev);
    if (!center) return { ok: false, message: '会場の位置が分かりませんでした' };
    await tq('UPDATE events SET lat = $1, lng = $2 WHERE id = $3', [center[0], center[1], eventId]);
  }
  const pages = [ev.official_url, ev.source_url].filter((u, i, a) => u && /^https?:/.test(u) && a.indexOf(u) === i);
  const images: string[] = [];
  for (const page of pages) {
    const html = await fetchHtml(page).catch(() => null);
    if (html) for (const u of findMapImages(html, page)) if (!images.includes(u)) images.push(u);
  }
  if (!images.length) return { ok: true, added: 0, message: '公式ページにガイドマップらしい画像が見つかりませんでした' };

  const reasons: string[] = [];
  const started = Date.now();
  for (const url of images.slice(0, MAX_IMAGES)) {
    if (Date.now() - started > TIME_BUDGET_MS) { reasons.push('時間内に処理しきれなかったため、残りの画像は次の機会に回しました'); break; }
    const img = await fetchBinary(url).catch(() => null);
    const size = img && imageSize(img.data);
    if (!img || !size) { reasons.push('画像を読み込めませんでした'); continue; }
    let read: GuideRead;
    try { read = await readGuideMap(img); } catch (e) { reasons.push(e instanceof Error ? e.message : String(e)); continue; }
    if (!read.is_venue_map || !read.facilities.length) { reasons.push('地図ではない・施設が読み取れない画像でした'); continue; }
    // 目印の実際の位置を調べる（最大8つ）
    const pairs: { name: string; px: number; py: number; lat: number; lng: number }[] = [];
    for (const lm of read.landmarks.slice(0, 6)) {
      const p = await locateLandmark(lm.name.trim(), ev, center);
      if (p) pairs.push({ name: lm.name, px: (lm.x / 100) * size.w, py: (lm.y / 100) * size.h, lat: p[0], lng: p[1] });
    }
    if (pairs.length < 3) { reasons.push(`位置の分かる目印が足りませんでした（${pairs.length}か所）`); continue; }
    // 食い違いの大きい目印を1つずつ外して、なお3つ以上残れば計算し直す
    let fit = fitSimilarity(pairs, center);
    while (pairs.length > 3 && Math.max(...fit.err) > MAX_ONE_M) {
      pairs.splice(fit.err.indexOf(Math.max(...fit.err)), 1);
      fit = fitSimilarity(pairs, center);
    }
    if (fit.rms > MAX_RMS_M || Math.max(...fit.err) > MAX_ONE_M || fit.metersPerPx < 0.02 || fit.metersPerPx > 50) {
      reasons.push(`位置合わせの誤差が大きいため使いませんでした（約${Math.round(fit.rms)}m）`); continue;
    }
    // 施設を置く（会場から2km以上離れる・同じ種類の既存の施設とほぼ同じ場所なら置かない）
    const cats = new Map((await tq<{ id: number; slug: string }>('SELECT id, slug FROM spot_categories')).map((c) => [c.slug, c.id]));
    const existing = await tq<{ category_id: number; lat: number; lng: number }>('SELECT category_id, lat, lng FROM spots WHERE event_id = $1 AND generic = 0', [eventId]);
    let added = 0;
    const err = Math.round(fit.rms / 10) * 10 || 10;
    for (const [i, f] of read.facilities.entries()) {
      const catId = cats.get(f.category);
      if (!catId) continue;
      const pos = fit.apply((f.x / 100) * size.w, (f.y / 100) * size.h);
      if (distanceM(center, pos) > 2000) continue;
      if (existing.some((s) => s.category_id === catId && distanceM([s.lat, s.lng], pos) < NEAR_M)) continue;
      const name = (f.label.trim() || LABEL[f.category]).slice(0, 60);
      await tq(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic, source, ext_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'guide', $8)`,
        [eventId, catId, name, `位置はガイドマップからの推定（目安・誤差 約${err}m）`, pos[0], pos[1], 200 + i, url.slice(0, 300)]);
      existing.push({ category_id: catId, lat: pos[0], lng: pos[1] });
      added++;
    }
    if (added) {
      // 実際の場所が入った種類の、投稿の無い汎用項目は外す
      for (const c of new Set(read.facilities.map((f) => cats.get(f.category)).filter((x): x is number => !!x))) {
        await tq(`DELETE FROM spots s WHERE s.event_id = $1 AND s.generic = 1 AND s.category_id = $2 AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.spot_id = s.id)`, [eventId, c]);
      }
      if (ev.map_mode !== 'geo') await tq("UPDATE events SET map_mode = 'geo' WHERE id = $1", [eventId]);
      const own = await tq<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eventId]);
      if (own.length) for (const c of cats.values()) await tq('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, c]);
    }
    return { ok: true, added, message: `ガイドマップから ${added}件 を目安の位置として追加しました（目印 ${pairs.length}か所・誤差 約${err}m）` };
  }
  return { ok: true, added: 0, message: `ガイドマップからは追加しませんでした：${[...new Set(reasons)].join('／')}` };
}
