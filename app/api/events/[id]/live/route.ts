import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { recentReports } from '@/lib/queries';
import { currentClientId, recordViews } from '@/lib/contrib';
import { one, q } from '@/lib/db';
import { isEnded } from '@/lib/dates';
import type { Report } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * 現地情報の自動更新（各閲覧者が20秒ごとに呼ぶ）。運用費を抑えるため：
 * - 全員に共通の投稿一覧は、サーバーごとに10秒だけ使い回す（閲覧者が何人いてもDBへの問い合わせは10秒に1回）
 * - 閲覧数の記録は、ブラウザのCookieで「30分に1回」に間引く
 * - 「自分の投稿」の判定は、投稿したことのあるブラウザ（匿名IDあり）のときだけ小さな問い合わせで行う
 */
const CACHE_MS = 10_000;
const SLOT_MS = 30 * 60_000;
const g = globalThis as unknown as { __liveCache?: Map<number, { at: number; reports: Report[]; ended: boolean }> };
const cache = (g.__liveCache ??= new Map<number, { at: number; reports: Report[]; ended: boolean }>());

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const headers = { 'Cache-Control': 'no-store' };
  if (!Number.isInteger(id)) return NextResponse.json({ now: Date.now(), reports: [] }, { headers });

  let entry = cache.get(id);
  if (!entry || Date.now() - entry.at > CACHE_MS) {
    const ev = await one<{ end_date: string; published: number }>('SELECT end_date, published FROM events WHERE id = $1', [id]);
    const ended = !ev || !ev.published || isEnded(ev.end_date); // 非公開・終了したイベントの投稿は公開しない
    entry = { at: Date.now(), ended, reports: ended ? [] : await recentReports(id) };
    cache.set(id, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  if (entry.ended) return NextResponse.json({ now: Date.now(), reports: [] }, { headers });

  const cid = await currentClientId();
  let reports = entry.reports;
  if (cid && reports.length) {
    const mine = new Set((await q<{ id: number }>('SELECT id FROM reports WHERE event_id = $1 AND client_id = $2 AND created_at >= $3',
      [id, cid, reports[reports.length - 1].created_at])).map((r) => r.id));
    if (mine.size) reports = reports.map((r) => (mine.has(r.id) ? { ...r, mine: true } : { ...r, mine: false }));
  }
  const res = NextResponse.json({ now: Date.now(), reports }, { headers });
  // 閲覧数の記録は30分に1回（同じ時間枠ならスキップ）
  const slot = `${id}:${Math.floor(Date.now() / SLOT_MS)}`;
  if ((await cookies()).get('evl_vs')?.value !== slot) {
    await recordViews(id).catch(() => {});
    res.cookies.set('evl_vs', slot, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  }
  return res;
}
