import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { autoMapPending } from '@/lib/automap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 定期実行（毎日）：地図の無い開催前・開催中のイベントに、会場マップを自動作成する（1回1件。終わるまで数回呼ばれる）。
 * 自動収集のON/OFFに関係なく動く（OpenStreetMap・国土地理院は無料。ガイドマップの読み取りだけ AI の費用が少しかかる） */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const r = await autoMapPending(1);
  return NextResponse.json({ ok: true, done: r.length < 1, results: r });
}
