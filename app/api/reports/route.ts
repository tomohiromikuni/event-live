import { NextResponse } from 'next/server';
import { createReport } from '@/lib/posting';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { spotId?: unknown; value?: unknown } | null;
  if (!body || typeof body.spotId !== 'number' || typeof body.value !== 'string') {
    return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
  }
  const res = await createReport(body.spotId, body.value);
  return NextResponse.json(res, { status: res.ok ? 201 : 429 });
}
