import 'server-only';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { one, q } from './db';
import { collectModel, extractorReady } from './collect/extract';
import { addSpend, costYen, discoverSettings, monthSpend } from './collect/discover';
import { trAuto } from './i18n';
import { todayJST } from './dates';

/**
 * イベントの中身（名前・公式情報・施設名）を英語にする（英語版のため）。
 * 公開中のイベントを1回だけ AI（Haiku）で訳して event_i18n に保存し、元の文が変わったときだけ訳し直す（1件1円未満・月の上限金額の中）。
 * 自動で作った施設名（「トイレ（会場から北へ約200m）」など）は AI に送らず、決まった言い方で訳す（lib/i18n.ts の trAuto）。
 * 推測で情報を足さない：書かれていないことは訳文にも書かない。
 */
export const TR_FIELDS = ['name', 'summary', 'venue_name', 'city', 'time_text', 'access', 'nearest_station', 'organizer', 'ticket_info',
  'parking_info', 'shuttle_info', 'toilet_info', 'traffic_info', 'food_info', 'status_note'] as const;
type Field = (typeof TR_FIELDS)[number];
export type EventEn = Partial<Record<Field, string>> & { spots?: Record<string, string> };

const SYSTEM = `You translate Japanese event information for a Japanese website into natural, concise English for foreign visitors.
- Translate faithfully. Do not add information that is not in the Japanese text. Keep numbers, times, prices and phone numbers exactly.
- Event and place names: use the official English name if it is well known (e.g. 大通公園 → Odori Park); otherwise romanize (Hepburn) and add a short English word for the type (e.g. 〇〇駐車場 → Maruyama Parking).
- Keep empty strings empty. Return JSON only.`;

let client: Anthropic | null = null;

/** 英語の訳（無ければ null） */
export async function eventEn(eventId: number): Promise<EventEn | null> {
  const r = await one<{ data: string }>("SELECT data FROM event_i18n WHERE event_id = $1 AND lang = 'en'", [eventId]).catch(() => null);
  return r ? (JSON.parse(r.data) as EventEn) : null;
}

/** 訳す（元の文が前回と同じなら何もしない）。訳したら true */
export async function translateEvent(eventId: number): Promise<boolean> {
  if (!extractorReady()) return false;
  const ev = await one<Record<Field, string> & { id: number }>(`SELECT id, ${TR_FIELDS.join(', ')} FROM events WHERE id = $1`, [eventId]);
  if (!ev) return false;
  const names = (await q<{ name: string }>(`SELECT DISTINCT name FROM spots WHERE event_id = $1 AND source <> 'user' ORDER BY name LIMIT 80`, [eventId]))
    .map((r) => r.name).filter((n) => trAuto(n, 'en') === n && /[ぁ-んァ-ヶ一-龠]/.test(n)); // 決まった言い方で訳せないものだけ
  const src: Record<string, string> = {};
  for (const f of TR_FIELDS) if (ev[f]?.trim()) src[f] = ev[f].trim();
  const hash = createHash('sha256').update(JSON.stringify([src, names])).digest('hex').slice(0, 24);
  const prev = await one<{ src_hash: string }>("SELECT src_hash FROM event_i18n WHERE event_id = $1 AND lang = 'en'", [eventId]);
  if (prev?.src_hash === hash) {
    await q("UPDATE event_i18n SET updated_at = $1 WHERE event_id = $2 AND lang = 'en'", [Date.now(), eventId]); // 変わっていない（次の対象から外す）
    return false;
  }
  const { budgetYen } = await discoverSettings();
  if ((await monthSpend()) + 2 > budgetYen) return false;

  const props: Record<string, unknown> = Object.fromEntries(Object.keys(src).map((k) => [k, { type: 'string' }]));
  props.spots = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ja', 'en'], properties: { ja: { type: 'string' }, en: { type: 'string' } } } };
  const schema = { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: collectModel(), max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify({ fields: src, spot_names: names }) }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  const input = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
  await addSpend(costYen({ searches: 0, input, output: res.usage.output_tokens }));
  if (res.stop_reason !== 'end_turn' && res.stop_reason !== 'stop_sequence') return false;
  const got = JSON.parse(res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')) as Record<string, unknown>;
  const out: EventEn = {};
  for (const f of TR_FIELDS) if (typeof got[f] === 'string' && (got[f] as string).trim()) out[f] = (got[f] as string).trim().slice(0, 600);
  out.spots = Object.fromEntries(((got.spots as { ja: string; en: string }[]) ?? []).filter((x) => x?.ja && x?.en).map((x) => [x.ja, x.en.slice(0, 80)]));
  await q(`INSERT INTO event_i18n (event_id, lang, data, src_hash, updated_at) VALUES ($1, 'en', $2, $3, $4)
    ON CONFLICT (event_id, lang) DO UPDATE SET data = $2, src_hash = $3, updated_at = $4`, [eventId, JSON.stringify(out), hash, Date.now()]);
  return true;
}

/** 訳がまだ無い・古い公開中のイベントを訳す（定期実行・1回 limit 件） */
export async function translatePending(limit = 3): Promise<{ id: number; name: string }[]> {
  const evs = await q<{ id: number; name: string }>(`SELECT e.id, e.name FROM events e
    LEFT JOIN event_i18n t ON t.event_id = e.id AND t.lang = 'en'
    WHERE e.published = 1 AND e.is_sample = 0 AND e.end_date >= $2
      AND (t.event_id IS NULL OR t.updated_at < e.updated_at)
    ORDER BY e.start_date LIMIT $1`, [limit, todayJST()]);
  const done = [];
  for (const e of evs) if (await translateEvent(e.id).catch(() => false)) done.push(e);
  return done;
}

/** 一覧のカードを英語の名前・場所に置き換える（訳が無いものは日本語のまま） */
export async function applyEn<T extends { id: number; name: string; city: string; venue_name: string }>(events: T[]): Promise<T[]> {
  if (!events.length) return events;
  const rows = await q<{ event_id: number; data: string }>(`SELECT event_id, data FROM event_i18n WHERE lang = 'en' AND event_id IN (${events.map((_, i) => `$${i + 1}`).join(', ')})`, events.map((e) => e.id)).catch(() => []);
  const m = new Map(rows.map((r) => [r.event_id, JSON.parse(r.data) as EventEn]));
  return events.map((e) => { const en = m.get(e.id); return en ? { ...e, name: en.name ?? e.name, city: en.city ?? e.city, venue_name: en.venue_name ?? e.venue_name } : e; });
}
