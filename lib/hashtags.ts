/**
 * ハッシュタグの自動生成（イベナウ公式タグ ＋ 地域 ＋ ジャンル/季節 ＋ 状況）。
 * AIではなくルールで作る：費用がかからず、関係の薄いタグが混ざらず、同じイベントには毎回同じタグが付く。
 * 管理画面でイベントごとに上書きできる（events.hashtags）。
 */
export const OFFICIAL_TAG = '#イベナウ';
export const MAX_TAGS = 4;

/** ジャンル → タグ（祭りは季節で言い分ける） */
const GENRE_TAG: Record<string, string | ((month: number) => string)> = {
  fireworks: '花火大会',
  festival: (m) => (m >= 6 && m <= 8 ? '夏祭り' : m >= 9 && m <= 11 ? '秋祭り' : 'お祭り'),
  music: '音楽フェス',
  marche: 'マルシェ',
  food: 'グルメイベント',
  expo: '展示会',
  anime_game: 'アニメイベント',
  sports: 'スポーツ観戦',
  local: '地域イベント',
  seasonal: (m) => (m === 12 || m <= 2 ? '冬イベント' : m <= 5 ? '春イベント' : m <= 8 ? '夏イベント' : '秋イベント'),
};

/** タグに使えない文字を除く（空白・記号・句読点）。数字だけのタグや長すぎるタグは使わない */
export function cleanTag(raw: string): string | null {
  const t = raw.replace(/^[#＃]+/, '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
  if (!t || /^\d+$/.test(t) || t.length > 20) return null;
  return `#${t}`;
}

/** 都道府県名 → 地域タグ（東京都 → #東京イベント） */
export function regionTag(prefecture: string): string | null {
  if (!prefecture) return null;
  const p = prefecture === '北海道' ? '北海道' : prefecture.replace(/[都府県]$/, '');
  return cleanTag(`${p}イベント`);
}

/**
 * イベント名のタグ（X で同じイベントの話題を探せるように）。括弧の中・年・「第○回」を外す。
 * 長すぎる名前（20文字超）は付けない。管理画面でタグを上書きしているときは、#イベナウ 以外の最初のタグを使う。
 */
export function eventTag(e: { name?: string; hashtags?: string | null }): string | null {
  if (e.hashtags?.trim()) {
    const own = e.hashtags.split(/[\s,、]+/).map(cleanTag).find((t) => t && t !== OFFICIAL_TAG);
    if (own) return own;
  }
  if (!e.name) return null;
  const n = e.name
    .replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]|（[^）]*）|\([^)]*\)|「|」/g, ' ')
    .replace(/第\s*\d+\s*回|20\d\d(\s*-\s*\d\d)?年?/g, ' ');
  return cleanTag(n);
}

export type TagContext = 'default' | 'weekend' | 'today' | 'tomorrow' | 'live';

type EventLike = { prefecture: string; start_date: string; hashtags?: string | null; genre_slug?: string; name?: string };

/** 自動で付けるタグ（管理画面で上書きされていなければこれを使う） */
export function autoHashtags(e: EventLike): string[] {
  const month = Number(e.start_date.slice(5, 7)) || new Date().getMonth() + 1;
  const g = e.genre_slug ? GENRE_TAG[e.genre_slug] : undefined;
  const genre = typeof g === 'function' ? g(month) : g;
  return dedupe([OFFICIAL_TAG, regionTag(e.prefecture), genre ? cleanTag(genre) : null]);
}

/**
 * 投稿・共有に付けるタグ（3〜4個）。#イベナウ は必ず先頭。
 * 文脈タグ（週末・本日・現地情報）があれば地域・ジャンルより優先して入れる。
 */
export function hashtagsFor(e: EventLike, context: TagContext = 'default'): string[] {
  const base = e.hashtags?.trim()
    ? dedupe([OFFICIAL_TAG, ...e.hashtags.split(/[\s,、]+/).map(cleanTag)])
    : autoHashtags(e);
  const ctx = { weekend: '#週末イベント', today: '#今日のイベント', tomorrow: '#明日のイベント', live: '#現地情報', default: null }[context];
  const [official, ...rest] = base;
  // イベント名のタグを #イベナウ の次に入れる（同じイベントに行く人が X で話題を探せるように）
  return dedupe([official, eventTag(e), ctx, ...rest]).slice(0, MAX_TAGS);
}

function dedupe(tags: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
