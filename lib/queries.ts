import 'server-only';
import { one, q, type Param } from './db';
import { todayJST, weekendRange } from './dates';
import { FEED_HOURS } from './freshness';
import type { MapShape } from './shapes';
import type { Category, EventCard, EventRow, Genre, Report, ReportOption, Spot } from './types';

const CARD_SELECT = `SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.color AS genre_color
  FROM events e JOIN genres g ON g.id = e.genre_id`;

export function listGenres(): Promise<Genre[]> {
  return q<Genre>('SELECT * FROM genres ORDER BY sort, id');
}

export type SearchParams = { q?: string; genre?: string; pref?: string; when?: string; date?: string; limit?: number; includePast?: boolean };

/** イベント検索。期間は「重なり」で判定（開始日 <= 範囲終了 かつ 終了日 >= 範囲開始）。 */
export function searchEvents(p: SearchParams): Promise<EventCard[]> {
  const where: string[] = ['e.published = 1'];
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

export function featuredEvents(): Promise<EventCard[]> {
  return q<EventCard>(`${CARD_SELECT} WHERE e.published = 1 AND e.is_featured = 1 AND e.end_date >= $1
    ORDER BY e.start_date LIMIT 10`, [todayJST()]);
}

/** 直近1時間の投稿が多いイベント（＝今盛り上がっている） */
export function liveEvents(): Promise<EventCard[]> {
  return q<EventCard>(`SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.color AS genre_color, COUNT(r.id)::int AS live_count
    FROM events e JOIN genres g ON g.id = e.genre_id JOIN reports r ON r.event_id = e.id AND r.hidden = 0 AND r.created_at >= $1
    WHERE e.published = 1 GROUP BY e.id, g.id ORDER BY live_count DESC LIMIT 10`, [Date.now() - 3600_000]);
}

export async function prefectureCounts(): Promise<Record<string, number>> {
  const rows = await q<{ prefecture: string; n: number }>(`SELECT prefecture, COUNT(*)::int AS n FROM events
    WHERE published = 1 AND end_date >= $1 GROUP BY prefecture`, [todayJST()]);
  return Object.fromEntries(rows.map((r) => [r.prefecture, r.n]));
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
export function recentReports(eventId: number): Promise<Report[]> {
  if (!Number.isInteger(eventId)) return Promise.resolve([]);
  return q<Report>(`SELECT id, event_id, spot_id, value, label, level, created_at, flag_count FROM reports
    WHERE event_id = $1 AND hidden = 0 AND created_at >= $2 ORDER BY created_at DESC LIMIT 300`,
    [eventId, Date.now() - FEED_HOURS * 3600_000]);
}

/** 簡易マップの図形（エリア・線） */
export async function eventShapes(eventId: number): Promise<MapShape[]> {
  const rows = await q<Omit<MapShape, 'coords'> & { coords: string }>('SELECT * FROM map_shapes WHERE event_id = $1 ORDER BY sort, id', [eventId]);
  return rows.map((r) => ({ ...r, coords: JSON.parse(r.coords) as [number, number][] }));
}
