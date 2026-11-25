import 'server-only';
import { q } from './db';
import { importOsmFacilities } from './osm';
import { importGuideMap } from './guidemap';
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

/** まだ地図の無い（かんたん表示の）開催前・開催中のイベントに、まとめて実行する（1回の実行時間に収まるよう、1回1件を基本にする） */
export async function autoMapPending(limit = 1): Promise<{ id: number; name: string; message: string }[]> {
  const evs = await q<{ id: number; name: string }>(`SELECT id, name FROM events WHERE map_mode = 'simple' AND end_date >= $1 AND is_sample = 0
    ORDER BY start_date LIMIT $2`, [todayJST(), limit]);
  const out = [];
  for (const e of evs) out.push({ ...e, message: await autoMap(e.id) });
  return out;
}
