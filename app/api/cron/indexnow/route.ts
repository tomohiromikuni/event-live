import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { pingIndexNow } from '@/lib/indexnow';

export const dynamic = 'force-dynamic';

/** 定期実行（1時間ごと）：前回から公開・更新されたイベントのURLを IndexNow で検索エンジンに知らせる */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await pingIndexNow()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
