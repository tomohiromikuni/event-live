import 'server-only';
import { db } from './db';
import { todayJST, weekendRange } from './dates';
import { FEED_HOURS } from './freshness';
import type { Category, EventCard, EventRow, Genre, Report, ReportOption, Spot } from './types';

const CARD_SELECT = `SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.color AS genre_color
  FROM events e JOIN genres g ON g.id = e.genre_id`;

export function listGenres(): Genre[] {
  return db().prepare('SELECT * FROM genres ORDER BY sort, id').all() as Genre[];
}

export type SearchParams = { q?: string; genre?: string; pref?: string; when?: string; date?: string; limit?: number; includePast?: boolean };

/** イベント検索。期間は「重なり」で判定（開始日 <= 範囲終了 かつ 終了日 >= 範囲開始）。 */
export function searchEvents(p: SearchParams): EventCard[] {
  const where: string[] = ['e.published = 1'];
  const args: (string | number)[] = [];
  const today = todayJST();
  let range: [string, string] | null = null;
  if (p.date) range = [p.date, p.date];
  else if (p.when === 'today') range = [today, today];
  else if (p.when === 'weekend') range = weekendRange(today);
  if (range) {
    where.push('e.start_date <= ? AND e.end_date >= ?');
    args.push(range[1], range[0]);
  } else if (!p.includePast) {
    where.push('e.end_date >= ?');
    args.push(today);
  }
  if (p.when === 'upcoming') {
    where.push('e.start_date > ?');
    args.push(today);
  }
  if (p.q) {
    // 将来的には全文検索（PostgreSQL の pg_trgm / 外部検索エンジン）に置き換える
    for (const word of p.q.trim().split(/\s+/).slice(0, 5)) {
      where.push('(e.name LIKE ? OR e.venue_name LIKE ? OR e.city LIKE ? OR e.prefecture LIKE ? OR e.summary LIKE ?)');
      const w = `%${word}%`;
      args.push(w, w, w, w, w);
    }
  }
  if (p.genre) {
    where.push('g.slug = ?');
    args.push(p.genre);
  }
  if (p.pref) {
    where.push('e.prefecture = ?');
    args.push(p.pref);
  }
  args.push(p.limit ?? 50);
  return db().prepare(`${CARD_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.status = 'canceled', e.start_date, e.id LIMIT ?`).all(...args) as EventCard[];
}

export function featuredEvents(): EventCard[] {
  return db().prepare(`${CARD_SELECT} WHERE e.published = 1 AND e.is_featured = 1 AND e.end_date >= ?
    ORDER BY e.start_date LIMIT 10`).all(todayJST()) as EventCard[];
}

/** 直近1時間の投稿が多いイベント（＝今盛り上がっている） */
export function liveEvents(): EventCard[] {
  const since = Date.now() - 3600_000;
  return db().prepare(`SELECT e.*, g.name AS genre_name, g.icon AS genre_icon, g.color AS genre_color, COUNT(r.id) AS live_count
    FROM events e JOIN genres g ON g.id = e.genre_id JOIN reports r ON r.event_id = e.id AND r.hidden = 0 AND r.created_at >= ?
    WHERE e.published = 1 GROUP BY e.id ORDER BY live_count DESC LIMIT 10`).all(since) as EventCard[];
}

export function prefectureCounts(): Record<string, number> {
  const rows = db().prepare(`SELECT prefecture, COUNT(*) AS n FROM events WHERE published = 1 AND end_date >= ? GROUP BY prefecture`)
    .all(todayJST()) as { prefecture: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.prefecture, r.n]));
}

export function getEventBySlug(slug: string): EventCard | undefined {
  return db().prepare(`${CARD_SELECT} WHERE e.slug = ?`).get(slug) as EventCard | undefined;
}

export function getEventById(id: number): EventRow | undefined {
  return db().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
}

type CatRow = Omit<Category, 'options'> & { options_json: string | null };
function toCategory(r: CatRow): Category {
  const { options_json, ...rest } = r;
  return { ...rest, options: options_json ? (JSON.parse(options_json) as ReportOption[]) : [] };
}

export function listCategories(): Category[] {
  return (db().prepare(`SELECT c.*, rt.options AS options_json FROM spot_categories c
    LEFT JOIN report_types rt ON rt.id = c.report_type_id ORDER BY c.sort, c.id`).all() as CatRow[]).map(toCategory);
}

/** イベントで使うカテゴリ: イベント個別設定があればそれ、無ければジャンル既定 */
export function eventCategories(eventId: number, genreId: number): Category[] {
  const d = db();
  const own = d.prepare('SELECT COUNT(*) AS n FROM event_categories WHERE event_id = ?').get(eventId) as { n: number };
  const rows = own.n > 0
    ? d.prepare(`SELECT c.*, rt.options AS options_json FROM spot_categories c JOIN event_categories ec ON ec.category_id = c.id
        LEFT JOIN report_types rt ON rt.id = c.report_type_id WHERE ec.event_id = ? ORDER BY c.sort, c.id`).all(eventId)
    : d.prepare(`SELECT c.*, rt.options AS options_json FROM spot_categories c JOIN genre_categories gc ON gc.category_id = c.id
        LEFT JOIN report_types rt ON rt.id = c.report_type_id WHERE gc.genre_id = ? ORDER BY c.sort, c.id`).all(genreId);
  return (rows as CatRow[]).map(toCategory);
}

export function eventSpots(eventId: number): Spot[] {
  return db().prepare('SELECT * FROM spots WHERE event_id = ? ORDER BY sort, id').all(eventId) as Spot[];
}

/** リアルタイム表示用の投稿（非表示を除く直近 FEED_HOURS 時間） */
export function recentReports(eventId: number): Report[] {
  const since = Date.now() - FEED_HOURS * 3600_000;
  return db().prepare(`SELECT id, event_id, spot_id, value, label, level, created_at, flag_count FROM reports
    WHERE event_id = ? AND hidden = 0 AND created_at >= ? ORDER BY created_at DESC LIMIT 300`).all(eventId, since) as Report[];
}
