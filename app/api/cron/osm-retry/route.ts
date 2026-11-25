import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { retryOsmPending } from '@/lib/automap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 1時間ごと：OpenStreetMap につながらなかったイベントだけ取り直す（AI・自動収集は使わない。費用0円）。1回1件 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const r = await retryOsmPending(1);
  return NextResponse.json({ ok: true, done: r.length < 1, results: r });
}
