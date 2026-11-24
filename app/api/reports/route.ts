import { NextResponse } from 'next/server';
import { createReport } from '@/lib/posting';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { spotId?: unknown; value?: unknown } | null;
  if (!body || typeof body.spotId !== 'number' || typeof body.value !== 'string') {
    return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
  }
  const res = await createReport(body.spotId, body.value);
  // 現地情報の短いキャッシュを捨てて、次の自動更新ですぐ反映されるようにする
  if (res.ok) (globalThis as { __liveCache?: Map<number, unknown> }).__liveCache?.delete(res.report.event_id);
  return NextResponse.json(res, { status: res.ok ? 201 : 429 });
}
