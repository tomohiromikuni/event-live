import 'server-only';
import { consensus } from './consensus';
import { one, q, type Param } from './db';
import { todayJST, weekendRange } from './dates';
import { FEED_HOURS, FRESH_MIN } from './freshness';
import type { MapShape } from './shapes';
import type { Category, EventCard, EventRow, Genre, Report, ReportOption, Spot, SpotStatus } from './types';

const CARD_SELECT = `SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.slug AS genre_slug, g.color AS genre_color
  FROM events e JOIN genres g ON g.id = e.genre_id`;

export function listGenres(): Promise<Genre[]> {
  return q<Genre>('SELECT * FROM genres ORDER BY sort, id');
}

export type SearchParams = { q?: string; genre?: string; pref?: string; when?: string; date?: string; limit?: number; includePast?: boolean };

/** イベント検索。期間は「重なり」で判定（開始日 <= 範囲終了 かつ 終了日 >= 範囲開始）。 */
/**
 * 本番では、動作確認用のサンプル（架空のイベント）を一覧・検索・トップに出さない（初めて来た人が架空のイベントを見ないように）。
 * ローカル開発では出す。本番でも見たいときは環境変数 SHOW_SAMPLES=1。サンプルのページ自体は URL を直接開けば見られる（noindex）。
 */
export const HIDE_SAMPLES = !!process.env.VERCEL && process.env.SHOW_SAMPLES !== '1';
const NO_SAMPLE = HIDE_SAMPLES ? ' AND e.is_sample = 0' : '';

export function searchEvents(p: SearchParams): Promise<EventCard[]> {
  const where: string[] = ['e.published = 1' + NO_SAMPLE];
  const args: Param[] = [];
  const arg = (v: Param) => { args.push(v); return `$${args.length}`; };
  const today = todayJST();
  let range: [string, string] | null = null;
  if (p.date) range = [p.date, p.date];
  else if (p.when === 'today') range = [today, today];
  else if (p.when === 'weekend') range = weekendRange(today);
  if (range) where.push(`e.start_date <= ${arg(range[1])} AND e.end_date >= ${arg(range[0])}`);
  else if (!p.includePast) where.push(`e.end_date >= ${arg(today)}`);
  if (p.when === 'upcoming') where.push(`e.start_date > ${arg(today)}`);
  if (p.q) {
    // 将来的には全文検索（pg_trgm / 外部検索エンジン）に置き換える
    for (const word of p.q.trim().split(/\s+/).slice(0, 5)) {
      const w = arg(`%${word.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
      where.push(`(e.name ILIKE ${w} OR e.venue_name ILIKE ${w} OR e.city ILIKE ${w} OR e.prefecture ILIKE ${w} OR e.summary ILIKE ${w})`);
    }
  }
  if (p.genre) where.push(`g.slug = ${arg(p.genre)}`);
  if (p.pref) where.push(`e.prefecture = ${arg(p.pref)}`);
  return q<EventCard>(`${CARD_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.status = 'canceled', e.start_date, e.id LIMIT ${arg(p.limit ?? 50)}`, args);
}

/** URL用IDの並び順のまま、イベントのカードを取る（英語版の検索結果など） */
export async function eventsBySlugs(slugs: string[]): Promise<EventCard[]> {
  if (!slugs.length) return [];
  const rows = await q<EventCard>(`${CARD_SELECT} WHERE e.published = 1 AND e.slug IN (${slugs.map((_, i) => `$${i + 1}`).join(', ')})`, slugs);
  return slugs.map((sl) => rows.find((r) => r.slug === sl)).filter((x): x is EventCard => !!x);
}

export function featuredEvents(): Promise<EventCard[]> {
  return q<EventCard>(`${CARD_SELECT} WHERE e.published = 1${NO_SAMPLE} AND e.is_featured = 1 AND e.end_date >= $1
    ORDER BY e.start_date LIMIT 10`, [todayJST()]);
}

/** 直近1時間の投稿が多いイベント（＝今盛り上がっている） */
export function liveEvents(): Promise<EventCard[]> {
  return q<EventCard>(`SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.slug AS genre_slug, g.color AS genre_color, COUNT(r.id)::int AS live_count
    FROM events e JOIN genres g ON g.id = e.genre_id JOIN reports r ON r.event_id = e.id AND r.hidden = 0 AND r.created_at >= $1
    WHERE e.published = 1${NO_SAMPLE} GROUP BY e.id, g.id ORDER BY live_count DESC LIMIT 10`, [Date.now() - 3600_000]);
}

/**
 * イベントごとの「いまの状況」。地点ごとの最新の投稿のうち、新しい（FRESH_MIN 分以内）ものを
 * 新しい順に最大 perEvent 件返す。
 */
export async function latestSpotStatuses(eventIds: number[], perEvent = 3): Promise<Record<number, SpotStatus[]>> {
  const ids = eventIds.filter(Number.isInteger);
  if (ids.length === 0) return {};
  const now = Date.now();
  const rows = await q<SpotStatus & { value: string; who: string }>(`SELECT r.event_id, r.spot_id, s.name AS spot_name,
      c.slug AS cat_slug, c.icon AS cat_icon, r.value, r.label, r.level, r.created_at, r.client_id AS who
    FROM reports r JOIN spots s ON s.id = r.spot_id JOIN spot_categories c ON c.id = s.category_id
    WHERE r.hidden = 0 AND r.created_at >= $1 AND r.event_id IN (${ids.map((_, i) => `$${i + 2}`).join(', ')})`, [now - FRESH_MIN * 60_000, ...ids]);
  // 地点ごとに多数決（1人1票）
  const bySpot = new Map<number, typeof rows>();
  for (const r of rows) (bySpot.get(r.spot_id) ?? bySpot.set(r.spot_id, []).get(r.spot_id)!).push(r);
  const picked: SpotStatus[] = [];
  for (const list of bySpot.values()) {
    const c = consensus(list.map((r) => ({ ...r, created_at: Number(r.created_at) })), now);
    if (c && !c.stale) {
      const { value: _v, who: _w, ...rest } = c.report; // eslint-disable-line @typescript-eslint/no-unused-vars
      picked.push(rest);
    }
  }
  const out: Record<number, SpotStatus[]> = {};
  for (const r of picked.sort((a, b) => Number(b.created_at) - Number(a.created_at))) {
    const list = (out[r.event_id] ??= []);
    if (list.length < perEvent) list.push(r);
  }
  return out;
}

export async function prefectureCounts(): Promise<Record<string, number>> {
  const rows = await q<{ prefecture: string; n: number }>(`SELECT prefecture, COUNT(*)::int AS n FROM events
    WHERE published = 1 AND end_date >= $1 GROUP BY prefecture`, [todayJST()]);
  return Object.fromEntries(rows.map((r) => [r.prefecture, r.n]));
}

/** 古いURL（変更前のスラッグ）なら、いまのスラッグを返す */
export async function redirectedSlug(slug: string): Promise<string | null> {
  const r = await one<{ slug: string }>('SELECT e.slug FROM slug_redirects r JOIN events e ON e.id = r.event_id WHERE r.old_slug = $1', [slug]);
  return r && r.slug !== slug ? r.slug : null;
}

export function getEventBySlug(slug: string): Promise<EventCard | undefined> {
  return one<EventCard>(`${CARD_SELECT} WHERE e.slug = $1`, [slug]);
}

export function getEventById(id: number): Promise<EventRow | undefined> {
  return Number.isInteger(id) ? one<EventRow>('SELECT * FROM events WHERE id = $1', [id]) : Promise.resolve(undefined);
}

type CatRow = Omit<Category, 'options'> & { options_json: string | null };
function toCategory(r: CatRow): Category {
  const { options_json, ...rest } = r;
  return { ...rest, options: options_json ? (JSON.parse(options_json) as ReportOption[]) : [] };
}

export async function listCategories(): Promise<Category[]> {
  return (await q<CatRow>(`SELECT c.*, rt.options AS options_json FROM spot_categories c
    LEFT JOIN report_types rt ON rt.id = c.report_type_id ORDER BY c.sort, c.id`)).map(toCategory);
}

/** イベントで使うカテゴリ: イベント個別設定があればそれ、無ければジャンル既定 */
export async function eventCategories(eventId: number, genreId: number): Promise<Category[]> {
  const own = await q<CatRow>(`SELECT c.*, rt.options AS options_json FROM spot_categories c JOIN event_categories ec ON ec.category_id = c.id
    LEFT JOIN report_types rt ON rt.id = c.report_type_id WHERE ec.event_id = $1 ORDER BY c.sort, c.id`, [eventId]);
  const rows = own.length > 0 ? own
    : await q<CatRow>(`SELECT c.*, rt.options AS options_json FROM spot_categories c JOIN genre_categories gc ON gc.category_id = c.id
        LEFT JOIN report_types rt ON rt.id = c.report_type_id WHERE gc.genre_id = $1 ORDER BY c.sort, c.id`, [genreId]);
  return rows.map(toCategory);
}

export function eventSpots(eventId: number): Promise<Spot[]> {
  return q<Spot>('SELECT * FROM spots WHERE event_id = $1 ORDER BY sort, id', [eventId]);
}

/** リアルタイム表示用の投稿（非表示を除く直近 FEED_HOURS 時間） */
/** 投稿者の見分け用ハッシュの塩（匿名IDを外から逆算できないように） */
const WHO_SALT = process.env.IP_HASH_SALT || process.env.ADMIN_SECRET || 'evenow-who';

export function recentReports(eventId: number, cid?: string | null): Promise<Report[]> {
  if (!Number.isInteger(eventId)) return Promise.resolve([]);
  // mine: 閲覧しているブラウザ自身の投稿か（匿名IDは返さず、真偽だけを返す）
  return q<Report>(`SELECT id, event_id, spot_id, value, label, level, created_at, flag_count, (client_id = $3) AS mine,
      substr(md5(client_id || $4), 1, 10) AS who FROM reports
    WHERE event_id = $1 AND hidden = 0 AND created_at >= $2 ORDER BY created_at DESC LIMIT 300`,
    [eventId, Date.now() - FEED_HOURS * 3600_000, cid ?? '', WHO_SALT]);
}

/** 簡易マップの図形（エリア・線） */
export async function eventShapes(eventId: number): Promise<MapShape[]> {
  const rows = await q<Omit<MapShape, 'coords'> & { coords: string }>('SELECT * FROM map_shapes WHERE event_id = $1 ORDER BY sort, id', [eventId]);
  return rows.map((r) => ({ ...r, coords: JSON.parse(r.coords) as [number, number][] }));
}
