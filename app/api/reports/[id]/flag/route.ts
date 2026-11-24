import { NextResponse } from 'next/server';
import { flagReport } from '@/lib/posting';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const res = await flagReport(Number(id), String(body.reason ?? ''));
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
