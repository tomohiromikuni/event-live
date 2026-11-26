import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { one, q } from './db';
import { isOngoing } from './dates';
import type { ReportOption } from './types';

/**
 * 投稿制限のルール（判定はすべてサーバー側。同じ人＝ブラウザの匿名ID（Cookie））。
 * リアルタイムの混雑を共有するため、別の場所・別の種類への投稿は続けてできる。
 * - 同じ場所（＝同じイベント・同じ種類の同じ地点）への投稿は1分に1回
 * - 同じ内容（同じ選択肢）を続けて投稿するときは30秒あける（あちこちに同じ内容を連投するのを防ぐ）
 * - 短時間の大量投稿は止める（ブラウザ単位10分10件・回線（IPのハッシュ）単位10分40件）
 */
export const LIMITS = {
  sameSpotIntervalSec: 60,
  sameValueIntervalSec: 30,
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

export type PostResult = { ok: true; report: { id: number; event_id: number; spot_id: number; value: string; label: string; level: number; created_at: number; flag_count: number } }
  | { ok: false; error: string; code?: 'same_spot' | 'same_value' | 'too_many'; wait?: number };

/** 次に投稿できるまでの時間（「あと約40秒」「あと約3分」） */
export function waitText(sec: number) {
  return sec < 60 ? `あと約${Math.max(5, Math.ceil(sec / 5) * 5)}秒` : `あと約${Math.ceil(sec / 60)}分`;
}

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

  // 1) 同じ場所への投稿は1分に1回
  const lastSpot = await one<{ created_at: number }>('SELECT created_at FROM reports WHERE client_id = $1 AND spot_id = $2 ORDER BY created_at DESC LIMIT 1', [cid, spotId]);
  if (lastSpot && now - lastSpot.created_at < LIMITS.sameSpotIntervalSec * 1000) {
    const wait = Math.ceil((LIMITS.sameSpotIntervalSec * 1000 - (now - lastSpot.created_at)) / 1000);
    return { ok: false, code: 'same_spot', wait, error: `同じ場所への投稿は1分あけてください\n（${waitText(wait)}）` };
  }
  // 2) 同じ内容（同じ選択肢）を続けて投稿するときは30秒あける
  const last = await one<{ created_at: number; value: string; label: string }>('SELECT created_at, value, label FROM reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1', [cid]);
  if (last && last.label === opt.label && now - last.created_at < LIMITS.sameValueIntervalSec * 1000) {
    const wait = Math.ceil((LIMITS.sameValueIntervalSec * 1000 - (now - last.created_at)) / 1000);
    return { ok: false, code: 'same_value', wait, error: `同じ内容の投稿は30秒あけてください\n（${waitText(wait)}）` };
  }
  // 3) 短時間の大量投稿（ブラウザ単位・回線単位）。いちばん古い投稿が枠から外れるまでの時間を知らせる
  const windowMs = LIMITS.perClientWindowMin * 60000, since = now - windowMs;
  const tooMany = async (col: 'client_id' | 'ip_hash', val: string, max: number) => {
    const r = (await one<{ n: number; oldest: number | null }>(`SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest FROM (
      SELECT created_at FROM reports WHERE ${col} = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT $3) x`, [val, since, max]))!;
    return r.n >= max ? Math.ceil((Number(r.oldest) + windowMs - now) / 1000) : 0;
  };
  const wait = (await tooMany('client_id', cid, LIMITS.perClientMax)) || (await tooMany('ip_hash', iph, LIMITS.perIpMax));
  if (wait > 0) return { ok: false, code: 'too_many', wait, error: `短時間の投稿が多すぎます\n（${waitText(wait)}）` };

  const r = (await one<{ id: number }>(`INSERT INTO reports (event_id, spot_id, value, label, level, client_id, ip_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [spot.event_id, spotId, opt.value, opt.label, opt.level, cid, iph, now]))!;
  return { ok: true, report: { id: r.id, event_id: spot.event_id, spot_id: spotId, value: opt.value, label: opt.label, level: opt.level, created_at: now, flag_count: 0 } };
}

