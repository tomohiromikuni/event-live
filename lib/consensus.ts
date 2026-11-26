import { FRESH_MIN, EXPIRE_MIN } from './freshness';

/**
 * 地点の「いまの状況」を、1人の投稿で決めない（うその投稿・つられ投稿の対策）。
 * - 同じ人（端末）の投稿は、最新の1件だけを数える（連投で表示を変えられない）
 * - 直近 FRESH_MIN 分の投稿で多数決。同数なら新しい投稿の方
 * - 1位の割合が低い（6割未満）ときは「情報が分かれています」
 * - 直近の投稿が無く、FRESH〜EXPIRE 分前の投稿だけなら、最新の1件を「古い情報」として出す（今まで通り）
 * サーバー（トップページ・X投稿）と画面（詳細ページ）の両方で同じ判定を使う。
 */
export type Vote = { value: string; label: string; level: number; created_at: number; who: string };
export type Consensus<T extends Vote> = {
  /** 表示に使う投稿（多数派の中で最新のもの） */
  report: T;
  /** 多数派の人数・数えた人数（直近 FRESH_MIN 分） */
  count: number;
  voters: number;
  /** 意見が割れている（多数派が6割未満） */
  split: boolean;
  /** 割れているときの2番目の答え */
  other?: string;
  /** 直近の投稿が無く、古い投稿を出している */
  stale: boolean;
};

export function consensus<T extends Vote>(reports: T[], now: number): Consensus<T> | null {
  const live = reports.filter((r) => now - r.created_at < EXPIRE_MIN * 60_000);
  if (live.length === 0) return null;
  const fresh = live.filter((r) => now - r.created_at < FRESH_MIN * 60_000);
  if (fresh.length === 0) {
    const latest = live.reduce((a, b) => (b.created_at > a.created_at ? b : a));
    return { report: latest, count: 1, voters: 1, split: false, stale: true };
  }
  // 1人1票（その人の最新の投稿）
  const byWho = new Map<string, T>();
  for (const r of fresh) {
    const cur = byWho.get(r.who);
    if (!cur || r.created_at > cur.created_at) byWho.set(r.who, r);
  }
  const votes = [...byWho.values()];
  const tally = new Map<string, { n: number; latest: T }>();
  for (const v of votes) {
    const t = tally.get(v.value);
    if (!t) tally.set(v.value, { n: 1, latest: v });
    else { t.n++; if (v.created_at > t.latest.created_at) t.latest = v; }
  }
  const ranked = [...tally.values()].sort((a, b) => b.n - a.n || b.latest.created_at - a.latest.created_at);
  const top = ranked[0];
  const split = votes.length >= 2 && top.n / votes.length < 0.6;
  return { report: top.latest, count: top.n, voters: votes.length, split, other: split ? ranked[1]?.latest.label : undefined, stale: false };
}

/** 表示用の短い説明（例：「3人中2人」「情報が分かれています（待ちなし／20分以上）」） */
export function consensusNote(c: Consensus<Vote>, lang: 'ja' | 'en' = 'ja', tr: (l: string) => string = (l) => l): string {
  if (c.stale) return '';
  if (lang === 'en') {
    if (c.split) return `mixed reports (${tr(c.report.label)} / ${tr(c.other ?? '')})`;
    if (c.voters >= 2) return `${c.count} of ${c.voters} people`;
    return '1 report';
  }
  if (c.split) return `情報が分かれています（${c.report.label}／${c.other}）`;
  if (c.voters >= 2) return `${c.voters}人中${c.count}人`;
  return '1人の投稿';
}
