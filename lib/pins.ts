import 'server-only';
import { createHash } from 'node:crypto';
import { one, q } from './db';
import { isOngoing, todayJST } from './dates';
import { distanceM } from './osm';
import { getOrCreateClientId, ipHash } from './posting';
import { currentClientId } from './contrib';

/**
 * 来場者の「ここにもトイレ／駐車場／乗り場がある」報告（ピン）。登録なし・ワンタップ。
 * - 開催中・会場から1.5km以内だけ。位置はピンを立てるその1回だけ送る（誰がどこにいたかとしては記録しない）
 * - 1人目は「1人が報告・未確認」として薄く表示。ほかの人の「ここにある」で確認人数が増える
 * - 「見つからない」が2人以上で、確認より多ければ表示しない
 * - 同じ端末は1つのピンに1票。1日に報告できるのは5件まで
 * spots.source = 'user'、票は pin_votes（端末は塩付きハッシュで記録し、匿名IDそのものは保存しない）
 */
export const USER_SOURCE = 'user';
const KINDS = { toilet: 'トイレ', parking: '駐車場', shuttle: 'シャトルバス乗り場' } as const;
type Kind = keyof typeof KINDS;
const MAX_KM = 1.5;
const PER_DAY = 5;
const MERGE_M = 25;
const SALT = process.env.IP_HASH_SALT || process.env.ADMIN_SECRET || 'evenow-pin';
const whoOf = (cid: string) => createHash('sha256').update(SALT + 'pin' + cid).digest('hex').slice(0, 24);

export type PinStat = { yes: number; no: number; mine: number };

/** イベントのピンの確認人数（mine：この端末の票。1=ある、-1=見つからない、0=まだ） */
export async function pinStats(eventId: number): Promise<Record<number, PinStat>> {
  const cid = await currentClientId();
  const rows = await q<{ spot_id: number; yes: number; no: number; mine: number }>(`SELECT v.spot_id,
      COUNT(*) FILTER (WHERE v.vote = 1)::int AS yes, COUNT(*) FILTER (WHERE v.vote = -1)::int AS no,
      COALESCE(MAX(CASE WHEN v.who = $2 THEN v.vote END), 0)::int AS mine
    FROM pin_votes v JOIN spots s ON s.id = v.spot_id WHERE s.event_id = $1 GROUP BY v.spot_id`, [eventId, cid ? whoOf(cid) : '']);
  return Object.fromEntries(rows.map((r) => [r.spot_id, { yes: r.yes, no: r.no, mine: r.mine }]));
}

/** 表示してよいか（「見つからない」が2人以上で、確認より多ければ出さない） */
export const pinVisible = (s?: PinStat) => !s || !(s.no >= 2 && s.no >= s.yes);

type Result = { ok: true; spotId: number; merged: boolean; stat: PinStat; spot?: Record<string, unknown> } | { ok: false; error: string };

export async function createPin(eventId: number, kind: string, lat: number, lng: number, accuracy: number): Promise<Result> {
  if (!(kind in KINDS)) return { ok: false, error: '種類が不正です' };
  if (![lat, lng].every(Number.isFinite)) return { ok: false, error: '位置が取得できませんでした' };
  const ev = await one<{ id: number; lat: number; lng: number; start_date: string; end_date: string; status: string; map_mode: string }>(
    'SELECT id, lat, lng, start_date, end_date, status, map_mode FROM events WHERE id = $1 AND published = 1 AND is_sample = 0', [eventId]);
  if (!ev || ev.map_mode !== 'geo' || !(ev.lat || ev.lng)) return { ok: false, error: 'このイベントでは報告できません' };
  if (ev.status !== 'scheduled' || !isOngoing(ev.start_date, ev.end_date)) return { ok: false, error: '報告は開催中だけ受け付けています' };
  if (accuracy > 150) return { ok: false, error: '現在地の精度が低いため報告できません（電波の良い場所でもう一度）' };
  if (distanceM([ev.lat, ev.lng], [lat, lng]) > MAX_KM * 1000) return { ok: false, error: '会場の近く（1.5km以内）にいるときだけ報告できます' };

  const cid = await getOrCreateClientId();
  const who = whoOf(cid);
  // 1日に報告できる数（同じ端末・同じ回線のどちらでも数える。回線は会場Wi-Fiで共有され得るので多め）
  const iph = await ipHash();
  const dayStart = Date.parse(`${todayJST()}T00:00:00+09:00`);
  const [{ byMe, byIp }] = await q<{ byMe: number; byIp: number }>(`SELECT COUNT(*) FILTER (WHERE ext_id = $2)::int AS "byMe", COUNT(*) FILTER (WHERE ip_hash = $3)::int AS "byIp"
    FROM spots WHERE source = $1 AND created_at >= $4`, [USER_SOURCE, `user:${who}`, iph, dayStart]);
  if (byMe >= PER_DAY || byIp >= PER_DAY * 6) return { ok: false, error: `報告は1日${PER_DAY}件までです` };

  const cat = await one<{ id: number }>('SELECT id FROM spot_categories WHERE slug = $1', [kind]);
  if (!cat) return { ok: false, error: '種類が不正です' };
  // すぐ近く（25m以内）に同じ種類があれば：来場者のピンなら「確認」に、それ以外（公式・地図の施設）ならそちらを使ってもらう
  const near = (await q<{ id: number; lat: number; lng: number; source: string; name: string }>(
    'SELECT id, lat, lng, source, name FROM spots WHERE event_id = $1 AND category_id = $2 AND generic = 0', [eventId, cat.id]))
    .find((s) => distanceM([s.lat, s.lng], [lat, lng]) <= MERGE_M);
  if (near && near.source !== USER_SOURCE) return { ok: false, error: `すぐ近くに「${near.name}」があります。地図のその印から状況を投稿してください` };
  if (near) {
    await q(`INSERT INTO pin_votes (spot_id, who, vote, created_at) VALUES ($1, $2, 1, $3)
      ON CONFLICT (spot_id, who) DO UPDATE SET vote = 1, created_at = $3`, [near.id, who, Date.now()]);
    return { ok: true, spotId: near.id, merged: true, stat: (await pinStats(eventId))[near.id] ?? { yes: 1, no: 0, mine: 1 } };
  }
  const now = Date.now();
  const [{ id }] = await q<{ id: number }>(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic, source, ext_id, created_at, ip_hash)
    VALUES ($1, $2, $3, $4, $5, $6, 600, 0, $7, $8, $9, $10) RETURNING id`,
    [eventId, cat.id, `${KINDS[kind as Kind]}（来場者の報告）`, '来場者が現地から報告した場所（公式の情報ではありません）', +lat.toFixed(6), +lng.toFixed(6), USER_SOURCE, `user:${who}`, now, iph]);
  await q('INSERT INTO pin_votes (spot_id, who, vote, created_at) VALUES ($1, $2, 1, $3)', [id, who, now]);
  const spot = await one<Record<string, unknown>>('SELECT * FROM spots WHERE id = $1', [id]);
  return { ok: true, spotId: id, merged: false, stat: { yes: 1, no: 0, mine: 1 }, spot: spot ?? undefined };
}

export async function votePin(spotId: number, vote: number): Promise<Result> {
  if (!Number.isInteger(spotId) || (vote !== 1 && vote !== -1)) return { ok: false, error: 'リクエストが不正です' };
  const s = await one<{ id: number; event_id: number; start_date: string; end_date: string; status: string }>(`SELECT s.id, s.event_id, e.start_date, e.end_date, e.status
    FROM spots s JOIN events e ON e.id = s.event_id WHERE s.id = $1 AND s.source = $2 AND e.published = 1`, [spotId, USER_SOURCE]);
  if (!s) return { ok: false, error: '報告が見つかりません' };
  if (s.status !== 'scheduled' || !isOngoing(s.start_date, s.end_date)) return { ok: false, error: '確認は開催中だけ受け付けています' };
  const who = whoOf(await getOrCreateClientId());
  await q(`INSERT INTO pin_votes (spot_id, who, vote, created_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT (spot_id, who) DO UPDATE SET vote = $3, created_at = $4`, [spotId, who, vote, Date.now()]);
  return { ok: true, spotId, merged: false, stat: (await pinStats(s.event_id))[spotId] ?? { yes: 0, no: 0, mine: vote } };
}
