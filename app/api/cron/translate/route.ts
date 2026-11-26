import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { translatePending } from '@/lib/translate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 定期実行：外国語版（英語・中国語・韓国語）のため、訳がまだ無い・変わった公開中のイベントを訳す（1回3件・1件1円未満） */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const done = await translatePending(3);
  return NextResponse.json({ ok: true, done: done.length < 3, translated: done });
}
