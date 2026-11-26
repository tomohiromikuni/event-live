import 'server-only';
import { q } from './db';
import { todayJST, isOngoing } from './dates';
import { prefEn } from './i18n';

/**
 * 検索欄の予測候補。開催中・これからの公開イベント（サンプルは除く）を1分だけ覚えておき、
 * ひらがな・カタカナ・全角半角・大文字小文字の違いを無視して、名前・市区町村・都道府県・会場名で探す。
 * 並び：開催中 → 名前の先頭が一致 → 開催日が近い順。
 */
type Row = { slug: string; name: string; prefecture: string; city: string; venue_name: string; start_date: string; end_date: string; genre_slug: string; en: string | null };
export type Suggestion = { slug: string; name: string; place: string; start: string; end: string; ongoing: boolean; genre: string };

let cache: { at: number; rows: Row[] } | null = null;

/** 比べやすい形に（全角→半角・小文字・カタカナ→ひらがな・空白や記号を除く） */
export function normKana(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・\-ー_.,、。()（）「」【】]/g, '');
}

export async function suggestEvents(input: string, limit = 8, lang: 'ja' | 'en' = 'ja'): Promise<Suggestion[]> {
  if (!cache || Date.now() - cache.at > 60_000) {
    const rows = await q<Row>(`SELECT e.slug, e.name, e.prefecture, e.city, e.venue_name, e.start_date, e.end_date, g.slug AS genre_slug, t.data AS en
      FROM events e JOIN genres g ON g.id = e.genre_id LEFT JOIN event_i18n t ON t.event_id = e.id AND t.lang = 'en'
      WHERE e.published = 1 AND e.is_sample = 0 AND e.end_date >= $1 AND e.status <> 'canceled'
      ORDER BY e.start_date LIMIT 1000`, [todayJST()]);
    cache = { at: Date.now(), rows };
  }
  const words = input.trim().split(/\s+/).map(normKana).filter(Boolean).slice(0, 4);
  const scored = cache.rows.map((r) => {
    const en = r.en ? (JSON.parse(r.en) as { name?: string; city?: string; venue_name?: string }) : {};
    const name = lang === 'en' && en.name ? normKana(en.name) : normKana(r.name);
    const hay = normKana(r.name) + normKana(r.city) + normKana(r.prefecture) + normKana(r.venue_name) + normKana([en.name, en.city, en.venue_name, prefEn(r.prefecture)].filter(Boolean).join(''));
    if (words.some((w) => !hay.includes(w))) return null;
    const ongoing = isOngoing(r.start_date, r.end_date);
    const prefix = words.length > 0 && name.startsWith(words[0]);
    return { r, ongoing, score: (ongoing ? 0 : 2) + (prefix ? 0 : 1) };
  }).filter((x): x is { r: Row; ongoing: boolean; score: number } => !!x);
  scored.sort((a, b) => a.score - b.score || a.r.start_date.localeCompare(b.r.start_date));
  return scored.slice(0, limit).map(({ r, ongoing }) => {
    const en = lang === 'en' && r.en ? (JSON.parse(r.en) as { name?: string; city?: string; venue_name?: string }) : null;
    return en ? { slug: r.slug, name: en.name ?? r.name, place: [en.city ?? prefEn(r.prefecture), en.venue_name].filter(Boolean).join(' · '), start: r.start_date, end: r.end_date, ongoing, genre: r.genre_slug } : {
    slug: r.slug, name: r.name, place: [r.city || r.prefecture, r.venue_name].filter(Boolean).join('・'),
    start: r.start_date, end: r.end_date, ongoing, genre: r.genre_slug,
  }; });
}
