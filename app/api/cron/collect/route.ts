import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { getSetting, runCollect } from '@/lib/collect/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1回の実行時間の上限（秒）。処理が残れば done:false を返し、次の呼び出しで続ける

/**
 * 定期実行（GitHub Actions など）から呼ぶ入口。
 * Authorization: Bearer <CRON_SECRET> が必要。管理画面で自動収集がOFFなら何もしない。
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if ((await getSetting('collect_enabled', '0')) !== '1') return NextResponse.json({ ok: true, done: true, skipped: '自動収集はOFFです' });
  const r = await runCollect('cron');
  return NextResponse.json({ ok: true, done: r.done, fetched: r.fetched, extracted: r.extracted, new_candidates: r.new_candidates, published: r.published, errors: r.errors, log: r.log.slice(0, 3).map((l) => l.slice(0, 300)) });
}
