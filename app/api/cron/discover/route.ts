import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { getSetting, setSetting } from '@/lib/collect/run';
import { discoverSettings, runDiscover } from '@/lib/collect/discover';
import { runSweepStep } from '@/lib/collect/sweep';
import { todayJST } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 定期実行（毎日・自動収集の前）：
 * ① まとめ探し（月1回のバッチ検索）を送る・結果を受け取る・見つけたページを少しずつ取得（残りがあれば done:false）
 * ② それが済んだら、毎日の追加分の「AIで探す」を1回（1日の回数に達したら done:true。初期0回）
 * 自動収集がOFFなら何もしない（費用がかからない）。月の上限金額を超えそうなときは送らない。
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if ((await getSetting('collect_enabled', '0')) !== '1') return NextResponse.json({ ok: true, done: true, skipped: '自動収集はOFFです' });
  let sweep = '';
  try {
    const sw = await runSweepStep();
    sweep = sw.message;
    if (!sw.done) return NextResponse.json({ ok: true, done: false, sweep });
  } catch (e) {
    return NextResponse.json({ ok: true, done: true, error: `まとめ探し：${e instanceof Error ? e.message : String(e)}` });
  }
  const { perDay } = await discoverSettings();
  const day = todayJST();
  const count = (await getSetting('discover_day', '')) === day ? Number(await getSetting('discover_count', '0')) || 0 : 0;
  if (count >= perDay) return NextResponse.json({ ok: true, done: true, sweep, skipped: `毎日の追加分：今日の回数（${perDay}回）に達しました` });
  await setSetting('discover_day', day);
  await setSetting('discover_count', String(count + 1));
  try {
    const r = await runDiscover();
    return NextResponse.json({ ok: true, done: count + 1 >= perDay, message: r.message });
  } catch (e) {
    return NextResponse.json({ ok: true, done: count + 1 >= perDay, error: e instanceof Error ? e.message : String(e) });
  }
}
