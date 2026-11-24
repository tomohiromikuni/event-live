import { NextResponse } from 'next/server';
import { recentReports } from '@/lib/queries';
import { currentClientId, recordViews } from '@/lib/contrib';
import { one } from '@/lib/db';
import { isEnded } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const ev = Number.isInteger(id) ? await one<{ end_date: string; published: number }>('SELECT end_date, published FROM events WHERE id = $1', [id]) : undefined;
  // 非公開・終了したイベントの投稿は公開しない（データは管理画面に残る）
  if (!ev || !ev.published || isEnded(ev.end_date)) {
    return NextResponse.json({ now: Date.now(), reports: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const cid = await currentClientId();
  await recordViews(id).catch(() => {}); // 閲覧数の記録（失敗しても表示は続ける）
  return NextResponse.json({ now: Date.now(), reports: await recentReports(id, cid) }, { headers: { 'Cache-Control': 'no-store' } });
}
