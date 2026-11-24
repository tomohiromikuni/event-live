import { NextResponse } from 'next/server';
import { recentReports } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json({ now: Date.now(), reports: await recentReports(Number(id)) }, { headers: { 'Cache-Control': 'no-store' } });
}
