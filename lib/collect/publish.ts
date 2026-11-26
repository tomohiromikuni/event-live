import 'server-only';
import { one, q, tx, type Q } from '../db';
import { todayJST } from '../dates';
import { PREFECTURES } from '../prefectures';
import { enableSimpleMode } from '../simple';
import type { Extracted } from './extract';
import { getSetting } from './run';
import { cleanTag, OFFICIAL_TAG } from '../hashtags';

/**
 * 候補からイベントを作る（手動の承認・自動公開で共通）。
 * 公式マイマップが無ければ「かんたん表示」（カードだけ）にしておき、あとで会場マップを自動作成する。
 */
export async function createEventFromCandidate(
  c: { id: number; source_url: string; d: Extracted & { map_links?: string[] } },
  o: { name: string; start: string; end: string; pref: string; publish: boolean; auto?: boolean },
): Promise<number> {
  const d = c.d;
  const genre = await one<{ id: number }>('SELECT id FROM genres WHERE slug = $1', [d.genre]) ?? await one<{ id: number }>("SELECT id FROM genres WHERE slug = 'other'");
  const now = Date.now();
  const v = (x: string | null | undefined) => x ?? '';
  // 公式ハッシュタグがあれば、X の会話・共有ではそれを使う（同じタグに来場者・主催者の投稿が集まるように）
  const officialTag = d.official_hashtag ? cleanTag(d.official_hashtag) : null;
  const hashtags = officialTag && officialTag !== OFFICIAL_TAG ? officialTag : '';
  return tx(async (tq: Q) => {
    const [{ id }] = await tq<{ id: number }>(`INSERT INTO events (slug, name, genre_id, prefecture, city, venue_name, address, start_date, end_date, time_text,
        summary, organizer, official_url, access, nearest_station, traffic_info, parking_info, ticket_info, status,
        source_url, source_checked_at, published, is_sample, created_at, updated_at, shuttle_info, toilet_info, food_info, auto_published, hashtags)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,0,$23,$23,$24,$25,$26,$27,$28) RETURNING id`,
      [`ev-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, o.name.slice(0, 120), genre!.id, o.pref, v(d.city), v(d.venue_name), v(d.address), o.start, o.end, v(d.time_text),
        v(d.summary), v(d.organizer), v(d.official_url), v(d.access), v(d.nearest_station), v(d.traffic_info), v(d.parking_info), v(d.ticket_info),
        d.status === 'canceled' || d.status === 'postponed' ? d.status : 'scheduled', c.source_url, todayJST(), o.publish ? 1 : 0, now,
        v(d.shuttle_info), v(d.toilet_info), v(d.food_info), o.auto ? 1 : 0, hashtags]);
    await tq("UPDATE event_candidates SET status = $1, event_id = $2, updated_at = $3 WHERE id = $4", [o.auto ? 'auto' : 'approved', id, now, c.id]);
    if (!d.map_links?.length) await enableSimpleMode(tq, id);
    return id;
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 自動公開してよいか（運営者の方針：非公式サイトなので承認を待たずに公開する。ただし読み間違いを公開しないための最低限の条件）。
 * 満たさないものは今までどおり「収集した候補」に残り、管理画面で確認できる。
 */
export function autoPublishBlocker(d: Extracted, isDuplicate: boolean): string | null {
  if (isDuplicate) return '既存のイベントと重複の可能性';
  if (!d.name?.trim()) return 'イベント名なし';
  if (!d.start_date || !DATE_RE.test(d.start_date)) return '開催日が未確認';
  if (!d.evidence?.date) return '開催日の根拠（本文の文）が無い';
  const end = d.end_date && DATE_RE.test(d.end_date) ? d.end_date : d.start_date;
  if (end < todayJST()) return '終了済み';
  if (end < d.start_date) return '開催日が不正';
  if (!d.prefecture || !PREFECTURES.includes(d.prefecture)) return '都道府県が未確認';
  if (!d.venue_name && !d.address) return '会場・住所が未確認';
  return null;
}

/** 候補を保存した直後に呼ぶ：条件を満たせば、承認を待たずにイベントを作って公開する（会場マップは定期実行で自動作成） */
export async function tryAutoPublish(candidateId: number, isDuplicate: boolean): Promise<'published' | string> {
  if ((await getSetting('auto_publish', '1')) !== '1') return '自動公開はOFF';
  const c = await one<{ id: number; data: string; source_url: string; status: string }>('SELECT id, data, source_url, status FROM event_candidates WHERE id = $1', [candidateId]);
  if (!c || c.status !== 'pending') return '処理済み';
  const d = JSON.parse(c.data) as Extracted & { map_links?: string[] };
  const why = autoPublishBlocker(d, isDuplicate);
  if (why) {
    await q('UPDATE event_candidates SET note = $1 WHERE id = $2', [`自動公開せず：${why}`, c.id]);
    return why;
  }
  await createEventFromCandidate({ id: c.id, source_url: c.source_url, d }, {
    name: d.name.trim(), start: d.start_date!, end: d.end_date && DATE_RE.test(d.end_date) && d.end_date >= d.start_date! ? d.end_date : d.start_date!,
    pref: d.prefecture!, publish: false, auto: true,
  });
  // 載せられる情報（公式の駐車場・シャトルバス・トイレ・飲食の情報）がすでにあれば、すぐ公開。無ければ会場マップの自動作成のあとに判断
  return 'published';
}

/**
 * 載せられる情報があるか：公式情報（駐車場・シャトルバス・トイレ・交通規制）のどれかがある、
 * または地図にトイレ・駐車場などの場所が1つ以上ある。何も無いイベント（イベント名と日程だけ）は公開しない（運営者の方針）。
 */
export async function hasUsefulInfo(eventId: number): Promise<boolean> {
  const r = await one<{ info: boolean; spots: number }>(`SELECT
      (e.parking_info <> '' OR e.shuttle_info <> '' OR e.toilet_info <> '' OR e.traffic_info <> '') AS info,
      (SELECT COUNT(*)::int FROM spots s JOIN spot_categories c ON c.id = s.category_id
        WHERE s.event_id = e.id AND (s.generic = 0 OR s.source = 'official_temp') AND s.source <> 'user' AND c.slug IN ('toilet', 'parking', 'shuttle')) AS spots
    FROM events e WHERE e.id = $1`, [eventId]);
  return !!r && (r.info || r.spots > 0);
}

/** 自動で作ったイベントの公開・非公開を、載せられる情報の有無で決める（自動作成したもので、まだ終わっていないものだけ） */
export async function settleAutoPublish(eventId: number): Promise<'published' | 'hidden' | null> {
  const ev = await one<{ auto_published: number; published: number; end_date: string }>('SELECT auto_published, published, end_date FROM events WHERE id = $1', [eventId]);
  if (!ev || !ev.auto_published || ev.end_date < todayJST()) return null;
  const ok = await hasUsefulInfo(eventId);
  if (ok && !ev.published) { await q('UPDATE events SET published = 1, updated_at = $1 WHERE id = $2', [Date.now(), eventId]); return 'published'; }
  if (!ok && ev.published) { await q('UPDATE events SET published = 0, updated_at = $1 WHERE id = $2', [Date.now(), eventId]); return 'hidden'; }
  return null;
}
