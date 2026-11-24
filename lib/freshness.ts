/**
 * 情報の鮮度ルール（クライアント・サーバー共通）
 *  - FRESH_MIN 分以内 : 最新情報として表示
 *  - EXPIRE_MIN 分以内: 「○分前の情報」と古さを明示して表示
 *  - それ以上        : 現在の状況としては表示しない（履歴にのみ残る）
 */
export const FRESH_MIN = 30;
export const EXPIRE_MIN = 90;
/** フィードに表示する投稿の範囲 */
export const FEED_HOURS = 3;

export type Freshness = 'fresh' | 'stale' | 'expired';

export function ageMinutes(ts: number, now: number) {
  return Math.max(0, Math.floor((now - ts) / 60000));
}

export function freshness(ts: number, now: number): Freshness {
  const m = ageMinutes(ts, now);
  if (m < FRESH_MIN) return 'fresh';
  if (m < EXPIRE_MIN) return 'stale';
  return 'expired';
}

export function relTime(ts: number, now: number) {
  const m = ageMinutes(ts, now);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60 ? `${m % 60}分` : ''}前`;
}

export function clockTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

// 白文字を載せても読めるよう（コントラスト 4.5:1 以上）やや濃いめの色にしている
export const LEVEL_COLORS = ['#15803d', '#b45309', '#c2410c', '#dc2626', '#374151'];
export const NO_INFO_COLOR = '#94a3b8';
export function levelColor(level: number | null | undefined) {
  return level == null ? NO_INFO_COLOR : LEVEL_COLORS[Math.min(Math.max(level, 0), 4)];
}
