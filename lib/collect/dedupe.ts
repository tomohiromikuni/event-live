/**
 * 重複判定と信頼度。
 * - 名前を正規化（全角半角・空白・記号・「第○回」・西暦/年度・「開催」等の語）して比較
 * - 都道府県が同じ（または不明）で、開催日が重なる（前後3日以内）＋名前が似ている → 同じイベントとみなす
 */
import type { Extracted } from './extract';

export function normalizeName(name: string) {
  return name.normalize('NFKC').toLowerCase()
    .replace(/[【\[（(].*?[】\]）)]/g, '')           // 【サンプル】(第3回) などの括弧書き
    .replace(/第?\s*\d+\s*回/g, '')
    .replace(/(19|20)\d{2}\s*(年度?)?/g, '').replace(/令和\s*\d+\s*年度?/g, '')
    .replace(/(開催|のお知らせ|について|大会$)/g, (m) => (m === '大会' ? '大会' : ''))
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 文字の2文字組（bigram）の重なり具合（0〜1） */
export function similarity(a: string, b: string) {
  const A = normalizeName(a), B = normalizeName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.9;
  const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(A), gb = grams(B);
  let inter = 0; for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size || 1);
}

export function fingerprint(e: Pick<Extracted, 'name' | 'prefecture' | 'start_date'>) {
  return `${normalizeName(e.name)}|${e.prefecture ?? ''}|${e.start_date ?? ''}`;
}

const day = (d: string) => new Date(d + 'T00:00:00Z').getTime() / 86400_000;
/** 開催期間が重なる（前後 slack 日の余裕つき） */
export function datesOverlap(aStart: string | null, aEnd: string | null, bStart: string, bEnd: string, slack = 3) {
  if (!aStart) return false;
  const a0 = day(aStart), a1 = day(aEnd ?? aStart), b0 = day(bStart), b1 = day(bEnd);
  return a0 <= b1 + slack && b0 <= a1 + slack;
}

/** 信頼度（0〜100）：情報源の種類＋必要な項目がそろっているか＋根拠の引用があるか */
export function confidence(e: Extracted, trust: string) {
  let s = { official: 30, public: 25, other: 10 }[trust] ?? 10;
  if (e.start_date) s += 20;
  if (e.prefecture) s += 10;
  if (e.venue_name || e.address) s += 10;
  if (e.official_url) s += 5;
  if (e.status !== 'unknown') s += 5;
  if (e.evidence?.name) s += 5;
  if (e.evidence?.date) s += 10;
  if (e.evidence?.place) s += 5;
  return Math.min(100, s);
}
