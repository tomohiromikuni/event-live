import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { one, q } from './db';
import { isOngoing } from './dates';
import type { ReportOption } from './types';

/** 投稿制限のルール */
export const LIMITS = {
  sameSpotIntervalMin: 3, // 同じ地点への連続投稿の間隔
  perClientWindowMin: 10, // ブラウザ単位の投稿数制限（10分で最大10件）
  perClientMax: 10,
  perIpMax: 40, // 同一IP（会場Wi-Fiなどで共有され得るため緩め）
  autoHideFlags: 3, // 通報がこの件数に達したら自動で非表示
};

const CID_COOKIE = 'evl_cid';

/** ブラウザ単位の匿名ID（Cookie）。ログイン不要で連投防止・通報の重複防止に使う。 */
export async function getOrCreateClientId(): Promise<string> {
  const jar = await cookies();
  let cid = jar.get(CID_COOKIE)?.value;
  if (!cid || !/^[0-9a-f-]{36}$/.test(cid)) {
    cid = randomUUID();
    jar.set(CID_COOKIE, cid, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/' });
  }
  return cid;
}

/** IPアドレスは保存せず、ソルト付きハッシュのみ保存する */
export async function ipHash(): Promise<string> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update((process.env.IP_HASH_SALT || process.env.ADMIN_SECRET || 'dev-salt') + ip).digest('hex').slice(0, 32);
}

export type PostResult = { ok: true; report: { id: number; event_id: number; spot_id: number; value: string; label: string; level: number; created_at: number; flag_count: number } } | { ok: false; error: string };

export async function createReport(spotId: number, value: string): Promise<PostResult> {
  if (!Number.isInteger(spotId)) return { ok: false, error: '地点が見つかりません' };
  const spot = await one<{ id: number; event_id: number; start_date: string; end_date: string; status: string; options: string | null }>(`SELECT s.id, s.event_id, e.start_date, e.end_date, e.status, rt.options
    FROM spots s JOIN events e ON e.id = s.event_id JOIN spot_categories c ON c.id = s.category_id
    LEFT JOIN report_types rt ON rt.id = c.report_type_id WHERE s.id = $1 AND e.published = 1`, [spotId]);
  if (!spot) return { ok: false, error: '地点が見つかりません' };
  if (!spot.options) return { ok: false, error: 'この地点は投稿の対象外です' };
  if (spot.status === 'canceled') return { ok: false, error: 'このイベントは中止のため投稿できません' };
  if (!isOngoing(spot.start_date, spot.end_date)) return { ok: false, error: '投稿は開催期間中のみ受け付けています' };
  const opt = (JSON.parse(spot.options) as ReportOption[]).find((o) => o.value === value);
  if (!opt) return { ok: false, error: '選択肢が不正です' };

  const cid = await getOrCreateClientId();
  const iph = await ipHash();
  const now = Date.now();

  const lastSame = await one<{ created_at: number }>('SELECT created_at FROM reports WHERE client_id = $1 AND spot_id = $2 ORDER BY created_at DESC LIMIT 1', [cid, spotId]);
  if (lastSame && now - lastSame.created_at < LIMITS.sameSpotIntervalMin * 60000) {
    return { ok: false, error: `同じ地点への投稿は${LIMITS.sameSpotIntervalMin}分以上あけてください` };
  }
  const since = now - LIMITS.perClientWindowMin * 60000;
  const byClient = (await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM reports WHERE client_id = $1 AND created_at >= $2', [cid, since]))!;
  if (byClient.n >= LIMITS.perClientMax) return { ok: false, error: '短時間の投稿が多すぎます。しばらくしてからお試しください' };
  const byIp = (await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM reports WHERE ip_hash = $1 AND created_at >= $2', [iph, since]))!;
  if (byIp.n >= LIMITS.perIpMax) return { ok: false, error: '短時間の投稿が多すぎます。しばらくしてからお試しください' };

  const r = (await one<{ id: number }>(`INSERT INTO reports (event_id, spot_id, value, label, level, client_id, ip_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [spot.event_id, spotId, opt.value, opt.label, opt.level, cid, iph, now]))!;
  return { ok: true, report: { id: r.id, event_id: spot.event_id, spot_id: spotId, value: opt.value, label: opt.label, level: opt.level, created_at: now, flag_count: 0 } };
}

