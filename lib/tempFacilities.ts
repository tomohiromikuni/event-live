import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { one, q, type Q } from './db';
import { distanceM, findFacilityByName } from './osm';
import { todayJST, addDays } from './dates';
import { gatherOfficialTexts } from './collect/enrich';
import { collectModel, extractorReady } from './collect/extract';
import { addSpend, costYen, discoverSettings, monthSpend } from './collect/discover';

/**
 * 公式の「仮設トイレ・臨時駐車場・シャトルバス乗り場」（イベナウのいちばん価値のある情報）。
 * 公式サイト・ガイドマップに名前つきで書かれたものだけを取り込む（推測しない）。
 * - 名前から地図の位置を探せたもの（会場から3km以内）は地図に「臨時／仮設」の印で出す（位置は目安）
 * - 探せなかったものは、カードの一覧に名前だけ出す（「地図の位置は未確認」）
 * source = 'official_temp'。常設（OpenStreetMap）と見た目で区別する。
 */
export const TEMP_SOURCE = 'official_temp';
type Kind = 'toilet' | 'parking' | 'shuttle';
export type TempItem = { kind: Kind; name: string; note: string };

const KIND_LABEL: Record<Kind, string> = { toilet: '仮設トイレ', parking: '臨時駐車場', shuttle: 'シャトルバス乗り場' };
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;
const norm = (s: string) => s.normalize('NFKC').replace(/[\s・()（）「」]/g, '').toLowerCase();

/** 名前（「○○小学校グラウンド」など）から位置を探す。会場から3km以内で見つかったときだけ */
export async function locateByName(name: string, ev: { prefecture: string; city: string }, center: [number, number] | null): Promise<[number, number] | null> {
  if (!center || !(center[0] || center[1])) return null;
  // 「第1駐車場」のような名前だけでは場所が分からないので、施設らしい名前のときだけ探す
  const place = name.replace(/(臨時|仮設|特設|無料|有料|第[0-9０-９一二三四五六七八九十]+)?(駐車場|トイレ|乗り場|乗降場|バス停)$/, '').trim();
  if (place.length < 2 || !/(学校|小学校|中学校|高校|大学|公園|グラウンド|広場|センター|ホール|会館|体育館|駅|役場|市役所|町役場|運動場|球場|競技場|河川敷|港|神社|寺)/.test(place)) return null;
  const query = `${place} ${ev.city || ev.prefecture}`;
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim の利用ルール（1秒に1回まで）
  const res = await fetch(`${NOMINATIM}?format=jsonv2&countrycodes=jp&accept-language=ja&limit=5&q=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const hits = (await res.json().catch(() => [])) as { lat: string; lon: string }[];
  for (const h of hits) {
    const p: [number, number] = [Number(h.lat), Number(h.lon)];
    if (distanceM(center, p) <= 3000) return p;
  }
  return null;
}

/** 取り込む（同じ名前のものは重ねない）。追加した件数を返す */
export async function saveTempItems(tq: Q, eventId: number, items: TempItem[], from: string): Promise<{ added: number; onMap: number }> {
  const ev = (await tq<{ prefecture: string; city: string; lat: number; lng: number }>('SELECT prefecture, city, lat, lng FROM events WHERE id = $1', [eventId]))[0];
  if (!ev) return { added: 0, onMap: 0 };
  const cats = new Map((await tq<{ id: number; slug: string }>("SELECT id, slug FROM spot_categories WHERE slug IN ('toilet', 'parking', 'shuttle')")).map((c) => [c.slug, c.id]));
  const have = new Set((await tq<{ ext_id: string }>('SELECT ext_id FROM spots WHERE event_id = $1 AND source = $2', [eventId, TEMP_SOURCE])).map((r) => r.ext_id));
  const center: [number, number] | null = ev.lat || ev.lng ? [ev.lat, ev.lng] : null;
  let added = 0, onMap = 0;
  for (const [i, it] of items.slice(0, 20).entries()) {
    const catId = cats.get(it.kind);
    const name = it.name.trim().slice(0, 60);
    if (!catId || name.length < 2) continue;
    const ext = `temp:${it.kind}:${norm(name)}`;
    if (have.has(ext)) continue;
    have.add(ext);
    const pos = (it.kind !== 'shuttle' && center ? await findFacilityByName(center, name, it.kind).catch(() => null) : null)
      ?? await locateByName(name, ev, center).catch(() => null);
    const note = [`${KIND_LABEL[it.kind]}（公式・${from}）`, it.note.trim().slice(0, 60), pos ? '位置は名前からの目安' : '地図の位置は未確認'].filter(Boolean).join('・');
    await tq(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic, source, ext_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [eventId, catId, name, note.slice(0, 140), pos?.[0] ?? 0, pos?.[1] ?? 0, -50 + i, pos ? 0 : 1, TEMP_SOURCE, ext]);
    added++;
    if (pos) onMap++;
  }
  return { added, onMap };
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'name', 'note'],
        properties: { kind: { type: 'string', enum: ['toilet', 'parking', 'shuttle'] }, name: { type: 'string' }, note: { type: 'string' } },
      },
    },
  },
};
const SYSTEM = `あなたはイベントの公式ページから、イベントのために用意される「仮設トイレ」「臨時駐車場」「シャトルバス（臨時バス）の乗り場」を抜き出す係です。
- 本文に、そのイベントのために用意されると書かれていて、場所の名前があるものだけ（例：「臨時駐車場：○○小学校グラウンド」「仮設トイレ：西4丁目」「シャトルバス乗り場：○○駅東口」）。
- name は場所の名前（例：「○○小学校グラウンド」「西4丁目 仮設トイレ」「○○駅東口」）。kind は toilet / parking / shuttle。
- note は台数・料金・時間など書かれている補足を短く（無ければ空文字）。
- 公式が来場者に案内している常設の駐車場（「お車の方は○○駐車場をご利用ください」）も入れてよい。その場合 note に「常設」と書く。臨時・仮設のものは name か note に「臨時」「仮設」の言葉を残す。
- 場所の名前が無いもの（「臨時駐車場あり」だけ）、別のイベント・別の年のものは入れない。推測しない。無ければ items は空配列。`;

let client: Anthropic | null = null;

/**
 * 公式サイトから仮設トイレ・臨時駐車場・乗り場を読み取って取り込む。
 * ガイドマップや案内は開催の1〜2週間前に出ることが多いので、開催2週間前からは2日に1回、それ以外は7日に1回まで。
 */
/** 位置がまだ分からない公式の案内（一覧のみ）を、地図データの名前で探し直す（費用0円・毎回） */
export async function relocateTempItems(eventId: number): Promise<number> {
  const ev = await one<{ lat: number; lng: number; prefecture: string; city: string }>('SELECT lat, lng, prefecture, city FROM events WHERE id = $1', [eventId]);
  if (!ev || !(ev.lat || ev.lng)) return 0;
  const rows = await q<{ id: number; name: string; note: string; slug: string }>(`SELECT s.id, s.name, s.note, c.slug FROM spots s JOIN spot_categories c ON c.id = s.category_id
    WHERE s.event_id = $1 AND s.source = $2 AND s.generic = 1 AND c.slug IN ('toilet', 'parking', 'shuttle')`, [eventId, TEMP_SOURCE]);
  let n = 0, asked = 0;
  for (const r of rows) {
    // シャトルバス乗り場は駅・公園などの名前から探す（Nominatim の負担を抑えて1回3件まで）
    const pos = r.slug === 'shuttle'
      ? (asked++ < 3 ? await locateByName(r.name, ev, [ev.lat, ev.lng]).catch(() => null) : null)
      : await findFacilityByName([ev.lat, ev.lng], r.name, r.slug as 'toilet' | 'parking').catch(() => null);
    if (!pos) continue;
    await q('UPDATE spots SET lat = $1, lng = $2, generic = 0, note = $3 WHERE id = $4', [pos[0], pos[1], r.note.replace('地図の位置は未確認', r.slug === 'shuttle' ? '位置は名前からの目安' : '位置は地図データの同じ名前の施設'), r.id]);
    n++;
  }
  return n;
}

export async function importTempFacilities(eventId: number): Promise<string> {
  const ev = await one<{ name: string; official_url: string; source_url: string; start_date: string; temp_at: number }>(
    'SELECT name, official_url, source_url, start_date, temp_at FROM events WHERE id = $1', [eventId]);
  if (!ev || !extractorReady()) return '';
  const soon = ev.start_date <= addDays(todayJST(), 14);
  if (Date.now() - ev.temp_at < (soon ? 2 : 7) * 86400_000 - 3600_000) return '';
  const { budgetYen } = await discoverSettings();
  if ((await monthSpend()) + 3 > budgetYen) return '';
  await q('UPDATE events SET temp_at = $1 WHERE id = $2', [Date.now(), eventId]);
  const { texts } = await gatherOfficialTexts([ev.official_url, ev.source_url]);
  if (!texts.length) return '';
  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: collectModel(), max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `イベント名：${ev.name}\n\n${texts.join('\n\n').slice(0, 20_000)}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  const input = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
  await addSpend(costYen({ searches: 0, input, output: res.usage.output_tokens }));
  if (res.stop_reason === 'refusal') return '';
  const got = JSON.parse(res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')) as { items?: TempItem[] };
  const items = (got.items ?? []).filter((x) => x && x.name?.trim());
  if (!items.length) return '';
  const r = await saveTempItems(q, eventId, items, '公式サイト');
  return r.added ? `公式サイトから 仮設トイレ・臨時駐車場など ${r.added}件 を追加しました（地図に${r.onMap}件・一覧のみ${r.added - r.onMap}件）` : '';
}
