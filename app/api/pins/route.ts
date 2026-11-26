import { NextResponse } from 'next/server';
import { createPin } from '@/lib/pins';

/** 来場者の「ここにトイレ／駐車場／乗り場がある」報告（位置はこの1回だけ受け取り、場所として保存する） */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { eventId?: unknown; kind?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown } | null;
  if (!b || !Number.isInteger(b.eventId) || typeof b.kind !== 'string' || typeof b.lat !== 'number' || typeof b.lng !== 'number') {
    return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
  }
  const res = await createPin(b.eventId as number, b.kind, b.lat, b.lng, typeof b.accuracy === 'number' ? b.accuracy : 0);
  return NextResponse.json(res, { status: res.ok ? 201 : 400 });
}
