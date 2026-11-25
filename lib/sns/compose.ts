import 'server-only';
import crypto from 'node:crypto';
import { q } from '../db';
import { addDays, todayJST } from '../dates';
import { FRESH_MIN, clockTime } from '../freshness';
import { cleanTag, hashtagsFor, OFFICIAL_TAG } from '../hashtags';
import { composePost } from '../share';
import { consensus } from '../consensus';
import { siteUrl } from '../site';

/**
 * SNS投稿の下書きを作る（AIは使わず決まった型で作る：実際のデータ以外が入らない・費用がかからない）。
 * 種類：pre（前日案内）／ today（当日案内）／ live（現地の投稿）／ status（中止・延期）
 * 同じ下書きは二度作らない（dedupe_key がDBで一意）。取り消した下書きも同じキーで残るので、作り直されない。
 */
export type SnsKind = 'pre' | 'today' | 'live' | 'status';
export const KIND_LABEL: Record<SnsKind, string> = { pre: '前日案内', today: '当日案内', live: '現地の投稿', status: '中止・延期' };

type Ev = {
  id: number; slug: string; name: string; prefecture: string; start_date: string; end_date: string; status: string; hashtags: string;
  genre_slug: string; parking_info: string; shuttle_info: string; traffic_info: string; toilet_info: string; food_info: string;
};
export type Draft = { event_id: number; kind: SnsKind; text: string; dedupe_key: string; snapshot: string };

const EV_SELECT = `SELECT e.id, e.slug, e.name, e.prefecture, e.start_date, e.end_date, e.status, e.hashtags, g.slug AS genre_slug,
  e.parking_info, e.shuttle_info, e.traffic_info, e.toilet_info, e.food_info
  FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.published = 1 AND e.is_sample = 0`;

/** タグは3個まで（日本語は1文字が2文字分になるため本文を優先）：#イベナウ・イベント名・状況 */
function tags(e: Ev, ctx: 'tomorrow' | 'today' | 'live' | 'default') {
  const nameTag = cleanTag(e.name.replace(/[【［\[].*?[】］\]]/g, ''));
  const rest = hashtagsFor({ ...e }, ctx).filter((t) => t !== OFFICIAL_TAG);
  return [OFFICIAL_TAG, ...(nameTag ? [nameTag] : []), ...rest].filter((t, i, a) => a.indexOf(t) === i).slice(0, 3);
}
const link = (e: Ev, ref: string) => `${siteUrl()}/events/${e.slug}?ref=${ref}`;

/** 公式情報があるものだけを「まとめています」と書く（無いものを書くと誤解させるため） */
function topics(e: Ev) {
  return [e.parking_info && '駐車場', e.shuttle_info && 'シャトルバス', e.traffic_info && '交通規制', e.toilet_info && 'トイレ'].filter(Boolean) as string[];
}

function preText(e: Ev) {
  const t = topics(e);
  return composePost([
    `【${e.name}】`,
    'いよいよ明日開催！',
    t.length ? `${t.join('・')}などの情報をまとめています。` : '',
    '当日は来場者が投稿する現地の混雑情報も確認できます。',
  ], link(e, 'x_auto'), tags(e, 'tomorrow'));
}

function todayText(e: Ev) {
  const t = topics(e);
  return composePost([
    `【${e.name}｜本日開催】`,
    t.length ? `${t.join('・')}の情報と、現地の混雑状況はこちら。` : '現地の混雑状況はこちら。',
    '参加予定の方は事前にご確認ください。',
  ], link(e, 'x_auto'), tags(e, 'today'));
}

function statusText(e: Ev) {
  const label = e.status === 'canceled' ? '開催中止' : '延期';
  return composePost([
    `【${e.name}｜${label}】`,
    `${label}の情報を掲載しました。最新情報は必ず公式サイトでご確認ください。`,
  ], link(e, 'x_auto'), tags(e, 'default'));
}

type Rep = { spot_id: number; spot_name: string; value: string; label: string; level: number; created_at: number; client_id: string };

/** 現地の投稿：直近（FRESH_MIN 分）の投稿を地点ごとに最新1件ずつ。時刻・件数を必ず書く */
function liveText(e: Ev, reps: Rep[]) {
  // 地点ごとに多数決（同じ人は1票）。意見が割れている地点は X には出さない（誤った情報を広めないため）
  const bySpot = new Map<number, Rep[]>();
  for (const r of reps) (bySpot.get(r.spot_id) ?? bySpot.set(r.spot_id, []).get(r.spot_id)!).push(r);
  const items: Rep[] = [];
  for (const list of bySpot.values()) {
    const c = consensus(list.map((r) => ({ ...r, created_at: Number(r.created_at), who: r.client_id })), Date.now());
    if (c && !c.stale && !c.split) items.push(c.report);
  }
  items.sort((a, b) => b.created_at - a.created_at);
  if (!items.length) return null;
  const newest = items[0].created_at;
  const lines = [
    `【${e.name}｜現地の投稿 ${clockTime(newest)}時点】`,
    `直近${FRESH_MIN}分で${reps.length}件（来場者の投稿・公式発表ではありません）`,
    ...items.map((r) => `・${r.spot_name}：${r.label}（${clockTime(r.created_at)}）`),
  ];
  // 長すぎるときは composePost が後ろ（古い投稿）の行から削る
  const text = composePost(lines, link(e, 'x_auto_live'), tags(e, 'live'));
  const content = items.map((r) => `${r.spot_id}:${r.label}`).join('|');
  return { text, content, newest, count: reps.length };
}

export async function buildDrafts(opts: { liveMinUsers: number; liveGapMin: number }): Promise<Draft[]> {
  const today = todayJST(), tomorrow = addDays(today, 1);
  const out: Draft[] = [];
  // 前日案内
  for (const e of await q<Ev>(`${EV_SELECT} AND e.status = 'scheduled' AND e.start_date = $1`, [tomorrow])) {
    out.push({ event_id: e.id, kind: 'pre', text: preText(e), dedupe_key: `pre:${e.id}:${e.start_date}`, snapshot: '' });
  }
  // 当日案内（1イベント1回：初日）
  for (const e of await q<Ev>(`${EV_SELECT} AND e.status = 'scheduled' AND e.start_date = $1`, [today])) {
    out.push({ event_id: e.id, kind: 'today', text: todayText(e), dedupe_key: `today:${e.id}:${e.start_date}`, snapshot: '' });
  }
  // 中止・延期（終了していないもの。必ず管理者が確認してから投稿）
  for (const e of await q<Ev>(`${EV_SELECT} AND e.status IN ('canceled', 'postponed') AND e.end_date >= $1`, [today])) {
    out.push({ event_id: e.id, kind: 'status', text: statusText(e), dedupe_key: `status:${e.id}:${e.status}:${e.start_date}`, snapshot: '' });
  }
  // 現地の投稿（開催中・直近の投稿が複数人から・前回の現地投稿の下書き/投稿から一定時間あいている）
  const since = Date.now() - FRESH_MIN * 60_000;
  for (const e of await q<Ev>(`${EV_SELECT} AND e.status = 'scheduled' AND e.start_date <= $1 AND e.end_date >= $1`, [today])) {
    const reps = await q<Rep>(`SELECT r.spot_id, s.name AS spot_name, r.value, r.label, r.level, r.created_at, r.client_id FROM reports r JOIN spots s ON s.id = r.spot_id
      WHERE r.event_id = $1 AND r.hidden = 0 AND r.created_at >= $2 ORDER BY r.created_at DESC`, [e.id, since]);
    if (new Set(reps.map((r) => r.client_id)).size < opts.liveMinUsers) continue; // 1人だけの投稿では発信しない
    const last = (await q<{ created_at: number; snapshot: string }>(`SELECT created_at, snapshot FROM sns_posts WHERE event_id = $1 AND kind = 'live'
      AND status IN ('draft', 'posted') ORDER BY created_at DESC LIMIT 1`, [e.id]))[0];
    if (last && Date.now() - last.created_at < opts.liveGapMin * 60_000) continue;
    const l = liveText(e, reps);
    if (!l) continue;
    if (last && (JSON.parse(last.snapshot || '{}') as { content?: string }).content === l.content) continue; // 前回と同じ状況なら出さない
    const hash = crypto.createHash('sha1').update(l.content).digest('hex').slice(0, 12);
    out.push({ event_id: e.id, kind: 'live', text: l.text, dedupe_key: `live:${e.id}:${today}:${hash}`,
      snapshot: JSON.stringify({ content: l.content, newest: l.newest, count: l.count }) });
  }
  return out;
}

/** 下書きを保存する。すでに同じキーがあれば何もしない。作った件数を返す */
export async function saveDrafts(drafts: Draft[]) {
  let n = 0;
  const now = Date.now();
  for (const d of drafts) {
    const r = await q(`INSERT INTO sns_posts (event_id, channel, kind, text, dedupe_key, status, snapshot, created_at, updated_at)
      VALUES ($1, 'x', $2, $3, $4, 'draft', $5, $6, $6) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [d.event_id, d.kind, d.text, d.dedupe_key, d.snapshot, now]);
    n += r.length;
  }
  return n;
}
