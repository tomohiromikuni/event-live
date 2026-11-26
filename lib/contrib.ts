import 'server-only';
import { cookies, headers } from 'next/headers';
import { q } from './db';
import { EXPIRE_MIN, FRESH_MIN } from './freshness';
import { ipHash } from './posting';

/**
 * 投稿の貢献実績（この端末＝ブラウザの匿名IDごと）。
 * - 有効な投稿: 非表示・通報ありの投稿は数えない。同じ地点への10分以内の投稿はまとめて1件と数える（水増し防止）
 * - 閲覧数: 投稿が「現在の状況」として実際に表示された回数（閲覧者ごとに30分に1回・本人の閲覧は除く）
 * ポイント・クーポンは将来構想（docs/FUTURE_VISION.md）。ここでは扱わない。
 */
export const CID_COOKIE = 'evl_cid';
export const MIN_VIEWS_TO_SHOW = 10;

export async function currentClientId(): Promise<string | null> {
  const v = (await cookies()).get(CID_COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

/** 閲覧の記録。イベントページの表示時と、現地の状況の自動更新時に呼ぶ（検索ロボットは除外） */
export async function recordViews(eventId: number) {
  const ua = (await headers()).get('user-agent') ?? '';
  if (!ua || /bot|crawler|spider|slurp|preview|facebookexternalhit|headless/i.test(ua)) return;
  const cid = await currentClientId();
  const viewer = cid ?? `ip:${await ipHash()}`;
  const now = Date.now();
  // その地点の「いまの最新の投稿」として表示されている間だけ数える（次の投稿で入れ替わったら止まる）。
  // 同じ人は1回だけ（slot = 0 で固定。以前の30分ごとの記録は数えるときに人数へまとめる）
  await q(`INSERT INTO report_views (report_id, viewer, slot)
    SELECT id, $2, 0 FROM (
      SELECT DISTINCT ON (spot_id) id, client_id FROM reports
      WHERE event_id = $1 AND hidden = 0 AND created_at >= $3
      ORDER BY spot_id, created_at DESC
    ) latest
    WHERE client_id <> $4
    ON CONFLICT DO NOTHING`, [eventId, viewer, now - EXPIRE_MIN * 60_000, cid ?? '']);
}

export type Badge = { key: string; name: string; desc: string };

export type Contribution = {
  total: number; events: number; parking: number; toilet: number; shuttle: number;
  views: number; badges: Badge[];
  history: { id: number; event_name: string; event_slug: string; spot: string; label: string; level: number; created_at: number; status: string; people: number }[];
};

/** 称号の条件（有効な投稿で判定。ランキングや競争要素はつくらない） */
const BADGES: (Badge & { ok: (c: Omit<Contribution, 'badges' | 'history' | 'views'>) => boolean })[] = [
  { key: 'supporter', name: '情報提供サポーター', desc: '現地の情報をはじめて投稿', ok: (c) => c.total >= 1 },
  { key: 'events', name: 'イベント情報サポーター', desc: '3つ以上のイベントで情報を投稿', ok: (c) => c.events >= 3 },
  { key: 'parking', name: '駐車場情報サポーター', desc: '駐車場の情報を5件以上投稿', ok: (c) => c.parking >= 5 },
  { key: 'toilet', name: 'トイレ情報サポーター', desc: 'トイレの情報を5件以上投稿', ok: (c) => c.toilet >= 5 },
  { key: 'shuttle', name: 'シャトルバス情報サポーター', desc: 'シャトルバスの情報を5件以上投稿', ok: (c) => c.shuttle >= 5 },
  { key: 'member', name: 'イベナウ貢献メンバー', desc: '5つ以上のイベントで30件以上投稿', ok: (c) => c.total >= 30 && c.events >= 5 },
];
export const ALL_BADGES: Badge[] = BADGES.map(({ key, name, desc }) => ({ key, name, desc }));

export async function contributionOf(cid: string): Promise<Contribution> {
  const [[c], [v], history] = await Promise.all([
    q<{ total: number; events: number; parking: number; toilet: number; shuttle: number }>(`
      WITH valid AS (
        SELECT DISTINCT ON (r.spot_id, r.created_at / 600000) r.event_id, c.slug
        FROM reports r JOIN spots s ON s.id = r.spot_id JOIN spot_categories c ON c.id = s.category_id
        WHERE r.client_id = $1 AND r.hidden = 0 AND r.flag_count = 0
      )
      SELECT COUNT(*)::int AS total, COUNT(DISTINCT event_id)::int AS events,
        COUNT(*) FILTER (WHERE slug = 'parking')::int AS parking,
        COUNT(*) FILTER (WHERE slug = 'toilet')::int AS toilet,
        COUNT(*) FILTER (WHERE slug = 'shuttle')::int AS shuttle
      FROM valid`, [cid]),
    q<{ views: number }>(`SELECT COUNT(DISTINCT v.report_id::text || ':' || v.viewer)::int AS views FROM report_views v JOIN reports r ON r.id = v.report_id
      WHERE r.client_id = $1 AND r.hidden = 0`, [cid]),
    q<{ id: number; event_name: string; event_slug: string; spot: string; label: string; level: number; created_at: number; hidden: number; people: number; replaced: boolean }>(`
      SELECT r.id, e.name AS event_name, e.slug AS event_slug, s.name AS spot, r.label, r.level, r.created_at, r.hidden,
        (SELECT COUNT(DISTINCT v.viewer)::int FROM report_views v WHERE v.report_id = r.id) AS people,
        EXISTS (SELECT 1 FROM reports r2 WHERE r2.spot_id = r.spot_id AND r2.created_at > r.created_at AND r2.hidden = 0) AS replaced
      FROM reports r JOIN spots s ON s.id = r.spot_id JOIN events e ON e.id = r.event_id
      WHERE r.client_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [cid]),
  ]);
  const now = Date.now();
  const base = { total: c.total, events: c.events, parking: c.parking, toilet: c.toilet, shuttle: c.shuttle };
  return {
    ...base,
    views: v.views,
    badges: BADGES.filter((b) => b.ok(base)).map(({ key, name, desc }) => ({ key, name, desc })),
    history: history.map((h) => {
      const age = (now - h.created_at) / 60_000;
      const status = h.hidden ? '非表示（通報などにより）' : h.replaced && age < EXPIRE_MIN ? '次の投稿に入れ替わりました' : age < FRESH_MIN ? '現在の状況として表示中' : age < EXPIRE_MIN ? '少し前の情報として表示中' : '過去の情報';
      return { ...h, status };
    }),
  };
}

/** このイベントでの、この端末の投稿が見られた回数（イベントページで本人にだけ「役に立った」ことを伝える。実データのみ） */
export async function myViewsInEvent(cid: string, eventId: number): Promise<number> {
  const [r] = await q<{ n: number }>(`SELECT COUNT(DISTINCT v.report_id::text || ':' || v.viewer)::int AS n FROM report_views v JOIN reports r ON r.id = v.report_id
    WHERE r.client_id = $1 AND r.event_id = $2 AND r.hidden = 0`, [cid, eventId]);
  return r?.n ?? 0;
}
