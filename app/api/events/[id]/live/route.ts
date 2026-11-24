import { NextResponse } from 'next/server';
import { recentReports } from '@/lib/queries';
import { currentClientId, recordViews } from '@/lib/contrib';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const cid = await currentClientId();
  if (Number.isInteger(id)) await recordViews(id).catch(() => {}); // 閲覧数の記録（失敗しても表示は続ける）
  return NextResponse.json({ now: Date.now(), reports: await recentReports(id, cid) }, { headers: { 'Cache-Control': 'no-store' } });
}
