import type { Extracted } from './extract';

/**
 * 自動収集の候補を既存のイベントに反映するときの「変更点」。
 * 候補に値がある項目だけを比べる（候補が null＝ページに書かれていない項目は、既存の値を消さない）。
 * 既定でチェックを入れるのは「いま空欄の項目」と「開催日」（毎年開催の次回日程など）。
 * すでに入っている内容を上書きする項目・開催状況は、管理者が見比べてチェックする。
 */
export const MERGE_FIELDS = [
  ['dates', '開催日'], ['time_text', '時間'], ['status', '開催状況'], ['venue_name', '会場'], ['address', '住所'],
  ['access', 'アクセス'], ['nearest_station', '最寄り駅'], ['parking_info', '駐車場'], ['shuttle_info', 'シャトルバス'],
  ['traffic_info', '交通規制・周辺道路'], ['toilet_info', 'トイレ'], ['food_info', '飲食エリア'], ['ticket_info', '料金'],
  ['organizer', '主催'], ['official_url', '公式サイト'],
] as const;
export type MergeKey = (typeof MERGE_FIELDS)[number][0];

const STATUS_LABEL: Record<string, string> = { scheduled: '開催予定', canceled: '中止', postponed: '延期' };

export type Diff = { key: MergeKey; label: string; current: string; next: string; defaultOn: boolean };

export function candidateDiff(ev: Record<string, unknown>, d: Extracted): Diff[] {
  const out: Diff[] = [];
  for (const [key, label] of MERGE_FIELDS) {
    let cur = '', next = '';
    if (key === 'dates') {
      if (!d.start_date) continue;
      cur = `${ev.start_date}〜${ev.end_date}`; next = `${d.start_date}〜${d.end_date ?? d.start_date}`;
    } else if (key === 'status') {
      if (!d.status || d.status === 'unknown') continue;
      cur = STATUS_LABEL[String(ev.status)] ?? String(ev.status); next = STATUS_LABEL[d.status] ?? d.status;
    } else {
      const v = (d as unknown as Record<string, string | null>)[key];
      if (!v) continue;
      cur = String(ev[key] ?? ''); next = v;
    }
    if (cur.trim() === next.trim()) continue;
    out.push({ key, label, current: cur, next, defaultOn: key === 'dates' || (key !== 'status' && !cur.trim()) });
  }
  return out;
}

/** チェックされた項目を events の列と値に変換する（一覧にない項目・空の値は無視） */
export function mergeColumns(d: Extracted, keys: string[]): [string, string][] {
  const cols: [string, string][] = [];
  for (const k of new Set(keys)) {
    if (k === 'dates') {
      if (d.start_date) cols.push(['start_date', d.start_date], ['end_date', d.end_date ?? d.start_date]);
    } else if (k === 'status') {
      if (d.status === 'scheduled' || d.status === 'canceled' || d.status === 'postponed') cols.push(['status', d.status]);
    } else if (MERGE_FIELDS.some(([f]) => f === k)) {
      const v = (d as unknown as Record<string, string | null>)[k];
      if (v) cols.push([k, v]);
    }
  }
  return cols;
}
