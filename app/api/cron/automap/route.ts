import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { getSetting } from '@/lib/collect/run';
import { autoMapPending } from '@/lib/automap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 定期実行（自動収集のあと）：地図の無い開催前・開催中のイベントに、会場マップを自動作成する（1回2件まで） */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if ((await getSetting('collect_enabled', '0')) !== '1') return NextResponse.json({ ok: true, done: true, skipped: '自動収集はOFFです' });
  const r = await autoMapPending(2);
  return NextResponse.json({ ok: true, done: r.length < 2, results: r });
}
