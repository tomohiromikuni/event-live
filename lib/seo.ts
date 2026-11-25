import { fmtRange } from './dates';
import type { EventCard } from './types';

/**
 * イベント詳細ページのタイトル・説明文（検索結果に出る文）。
 * 検索される言葉（イベント名＋年＋駐車場・シャトルバス・トイレ・交通規制）を入れる。
 * シャトルバスは公式情報に記載があるときだけ入れる（無いのに入れると、探している人を誤解させるため）。
 * 説明文は事実（日程・会場・公式情報の冒頭）だけで組み立て、推測は書かない。
 */
export function eventYearName(e: Pick<EventCard, 'name' | 'start_date'>) {
  return /20\d\d/.test(e.name) ? e.name : `${e.name}${e.start_date.slice(0, 4)}`;
}

export function eventTitle(e: EventCard) {
  const topics = ['駐車場', ...(e.shuttle_info?.trim() ? ['シャトルバス'] : []), 'トイレ', '交通規制'];
  return `${eventYearName(e)} ${topics.join('・')}と混雑状況`;
}

export function eventDescription(e: EventCard) {
  const clip = (s: string, n: number) => {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  const place = `${e.prefecture}${e.city}${e.venue_name ? `「${e.venue_name}」` : ''}`;
  const facts = [
    e.parking_info && `駐車場：${clip(e.parking_info, 28)}`,
    e.shuttle_info && `シャトルバス：${clip(e.shuttle_info, 28)}`,
  ].filter(Boolean).join('／');
  return [
    `${fmtRange(e.start_date, e.end_date)}・${place}で開催。`,
    facts && `${facts}。`,
    '駐車場・トイレ・屋台の混雑や待ち時間を、来場者の投稿でリアルタイムに確認できます。',
  ].filter(Boolean).join('');
}
