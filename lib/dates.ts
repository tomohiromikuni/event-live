/** 日本時間ベースの日付ユーティリティ。日付は 'YYYY-MM-DD' 文字列で扱う。 */
export function todayJST(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 今週末（土日）の範囲。今日が土日なら今日〜日曜。 */
export function weekendRange(today = todayJST()): [string, string] {
  const dow = new Date(today + 'T00:00:00Z').getUTCDay(); // 0=日
  if (dow === 0) return [today, today];
  if (dow === 6) return [today, addDays(today, 1)];
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)];
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function fmtDate(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
}
export function fmtRange(start: string, end: string) {
  const y = start.slice(0, 4);
  const head = `${y}年 ${fmtDate(start)}`;
  return start === end ? head : `${head}〜${fmtDate(end)}`;
}

export function isOngoing(start: string, end: string, today = todayJST()) {
  return start <= today && today <= end;
}
