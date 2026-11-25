import 'server-only';
import { q } from './db';
import { importOsmFacilities } from './osm';
import { importGuideMap } from './guidemap';
import { settleAutoPublish } from './collect/publish';
import { todayJST } from './dates';

/**
 * 会場マップを自動で作る（人の手での位置合わせはしない）。
 * ① OpenStreetMap の常設トイレ・駐車場 → ② 公式ページのガイドマップから仮設のものを「目安」として追加。
 * どちらも見つからなければ、カードだけの表示のまま。
 */
export async function autoMap(eventId: number, opts: { guide?: boolean } = {}): Promise<string> {
  const msgs: string[] = [];
  const steps = opts.guide === false ? [importOsmFacilities] : [importOsmFacilities, importGuideMap];
  for (const step of steps) {
    try { msgs.push((await step(q, eventId)).message); } catch (e) { msgs.push(e instanceof Error ? e.message : String(e)); }
  }
  return msgs.join(' ／ ');
}

/**
 * 会場マップを自動で作る対象：開催前・開催中の実イベントで、
 * かんたん表示（地図なし）か、自動で作った地図（手で描いた・マイマップの施設が無い）のもの。同じイベントは7日に1回まで試す。
 */
export async function autoMapPending(limit = 1): Promise<{ id: number; name: string; message: string }[]> {
  const weekAgo = Date.now() - 7 * 86400_000;
  const evs = await q<{ id: number; name: string }>(`SELECT e.id, e.name FROM events e
    WHERE e.end_date >= $1 AND e.is_sample = 0 AND e.automap_at < $2
      AND (e.map_mode = 'simple' OR (e.map_mode = 'geo' AND NOT EXISTS (
        SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.generic = 0 AND s.source = '')))
    ORDER BY e.published DESC, e.start_date LIMIT $3`, [todayJST(), weekAgo, limit]);
  const out = [];
  for (const e of evs) {
    await q('UPDATE events SET automap_at = $1 WHERE id = $2', [Date.now(), e.id]); // 失敗しても毎回同じイベントで止まらないよう、先に記録
    let message = await autoMap(e.id);
    const settled = await settleAutoPublish(e.id).catch(() => null);
    if (settled === 'published') message += ' ／ 載せられる情報があるため公開しました';
    if (settled === 'hidden') message += ' ／ 載せられる情報が無いため非公開にしました';
    // 外部サービスの混雑などで取れなかったときは、7日待たずに翌日また試す
    if (/取得に失敗|接続できません|時間内に処理しきれ/.test(message)) await q('UPDATE events SET automap_at = $1 WHERE id = $2', [Date.now() - 6 * 86400_000, e.id]);
    out.push({ ...e, message });
  }
  return out;
}
