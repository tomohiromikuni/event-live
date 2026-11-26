import { NextResponse } from 'next/server';
import { votePin } from '@/lib/pins';

/** 来場者の報告への「ここにある（1）／見つからない（-1）」 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { spotId?: unknown; vote?: unknown } | null;
  if (!b || !Number.isInteger(b.spotId) || !Number.isInteger(b.vote)) return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
  const res = await votePin(b.spotId as number, b.vote as number);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
