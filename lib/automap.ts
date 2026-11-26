import 'server-only';
import { q } from './db';
import { importOsmFacilities } from './osm';
import { importGuideMap } from './guidemap';
import { settleAutoPublish } from './collect/publish';
import { todayJST } from './dates';
import { enrichOfficialInfo } from './collect/enrich';
import { importVenueArea } from './venueArea';
import { importTempFacilities } from './tempFacilities';
import { addDays } from './dates';

/**
 * 会場マップを自動で作る（人の手での位置合わせはしない）。
 * ① OpenStreetMap の常設トイレ・駐車場 → ② 公式ページのガイドマップから仮設のものを「目安」として追加。
 * どちらも見つからなければ、カードだけの表示のまま。
 */
export async function autoMap(eventId: number, opts: { guide?: boolean } = {}): Promise<string> {
  const msgs: string[] = [];
  // 先に公式情報を補う（会場の市区町村・住所が分かれば、地図の位置を正しく決められる）
  try { const m = await enrichOfficialInfo(eventId); if (m) msgs.push(m); } catch (e) { msgs.push(`公式情報の補完に失敗：${e instanceof Error ? e.message : e}`); }
  const steps = opts.guide === false ? [importOsmFacilities] : [importOsmFacilities, importGuideMap];
  for (const step of steps) {
    try { msgs.push((await step(q, eventId)).message); } catch (e) { msgs.push(e instanceof Error ? e.message : String(e)); }
  }
  // 公式の仮設トイレ・臨時駐車場・乗り場（名前つき）
  try { const m = await importTempFacilities(eventId); if (m) msgs.push(m); } catch (e) { msgs.push(`仮設・臨時の読み取りに失敗：${e instanceof Error ? e.message : e}`); }
  // 会場の範囲（公園・広場の外形）を薄く囲う
  try {
    const m = await importVenueArea(q, eventId);
    if (m) {
      msgs.push(m);
      // 会場の範囲が分かったので、範囲の周りからトイレ・駐車場を探し直す（広い会場で端の方も拾う）
      const again = await importOsmFacilities(q, eventId).catch(() => null);
      if (again?.message) msgs.push(`範囲の周りで探し直し：${again.message}`);
    }
  } catch { /* 囲めなくても地図は使える */ }
  return msgs.join(' ／ ');
}

/**
 * 会場マップを自動で作る対象：開催前・開催中の実イベントで、
 * かんたん表示（地図なし）か、自動で作った地図（手で描いた・マイマップの施設が無い）のもの。同じイベントは7日に1回まで試す。
 */
export async function autoMapPending(limit = 1): Promise<{ id: number; name: string; message: string }[]> {
  const weekAgo = Date.now() - 7 * 86400_000;
  const evs = await q<{ id: number; name: string }>(`SELECT e.id, e.name FROM events e
    WHERE e.end_date >= $1 AND e.is_sample = 0 AND (e.automap_at < $2 OR (e.start_date <= $4 AND e.automap_at < $5))
      AND (e.map_mode = 'simple' OR (e.map_mode = 'geo' AND NOT EXISTS (
        SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.generic = 0 AND s.source = '')))
    ORDER BY e.published DESC, e.start_date LIMIT $3`, [todayJST(), weekAgo, limit, addDays(todayJST(), 14), Date.now() - 2 * 86400_000]);
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

/**
 * OpenStreetMap だけのやり直し（1時間ごと）：前回つながらなかったイベントを、AIを使わずに取り直す（費用0円）。
 * 公開の無料サーバーが混んでいて断られることがあるため。成功したら、載せられる情報の有無で公開・非公開を決める。
 */
export async function retryOsmPending(limit = 2): Promise<{ id: number; name: string; message: string }[]> {
  const evs = await q<{ id: number; name: string }>(`SELECT id, name FROM events
    WHERE osm_pending = 1 AND end_date >= $1 AND is_sample = 0 ORDER BY osm_tried_at, start_date LIMIT $2`, [todayJST(), limit]);
  const out = [];
  for (const e of evs) {
    await q('UPDATE events SET osm_tried_at = $1 WHERE id = $2', [Date.now(), e.id]); // 同じイベントばかり試さないよう、順番に回す
    let message: string;
    try {
      message = (await importOsmFacilities(q, e.id, { patient: true })).message;
      // つながったが取れなかった（会場の位置が不明など）：やり直しても変わらないので対象から外す（7日ごとの自動作成では引き続き試す）
      await q('UPDATE events SET osm_pending = 0 WHERE id = $1', [e.id]);
    } catch (err) { message = err instanceof Error ? err.message : String(err); }
    const settled = await settleAutoPublish(e.id).catch(() => null);
    if (settled === 'published') message += ' ／ 載せられる情報があるため公開しました';
    if (settled === 'hidden') message += ' ／ 載せられる情報が無いため非公開にしました';
    out.push({ ...e, message });
  }
  return out;
}
