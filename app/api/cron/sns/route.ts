import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { runSnsCron } from '@/lib/sns/auto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 定期実行（15分ごと）：SNS の下書きを作り、自動投稿がONなら1件だけ投稿する */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runSnsCron()) });
}
