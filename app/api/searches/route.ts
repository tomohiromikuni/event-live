import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { q } from '@/lib/db';
import { todayJST } from '@/lib/dates';
import { isAdmin } from '@/lib/admin';

const BOT_RE = /bot|crawler|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

/** 全角英数を半角に、英字を小文字に、空白をまとめて、表記ゆれを減らす */
function normalizeQuery(s: string) {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
}

/**
 * サイト内検索で使われた言葉を記録する（管理画面のアナリティクス用）。
 * 検索結果のページがブラウザで表示されたときだけ送られる。検索ロボットと管理者の検索は数えない。
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { q?: unknown; count?: unknown } | null;
  const query = typeof b?.q === 'string' ? normalizeQuery(b.q) : '';
  if (!query || !Number.isInteger(b?.count)) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = (await headers()).get('user-agent') ?? '';
  if (!ua || BOT_RE.test(ua) || (await isAdmin())) return NextResponse.json({ ok: true, counted: false });
  const zero = (b!.count as number) === 0 ? 1 : 0;
  await q(`INSERT INTO search_queries (day, query, searches, zero_results) VALUES ($1, $2, 1, $3)
    ON CONFLICT (day, query) DO UPDATE SET searches = search_queries.searches + 1, zero_results = search_queries.zero_results + $3`,
    [todayJST(), query, zero]);
  return NextResponse.json({ ok: true, counted: true });
}
