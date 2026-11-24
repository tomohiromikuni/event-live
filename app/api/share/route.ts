import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

const CHANNELS = ['x', 'line', 'copy', 'native'];

/** 共有ボタンが押されたことを記録する（集計用。個人を特定する情報は保存しない） */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { eventId?: unknown; channel?: unknown; context?: unknown } | null;
  if (!b || !Number.isInteger(b.eventId) || !CHANNELS.includes(String(b.channel))) return NextResponse.json({ ok: false }, { status: 400 });
  await q(`INSERT INTO share_events (event_id, action, channel, context, created_at)
    SELECT $1, 'click', $2, $3, $4 WHERE EXISTS (SELECT 1 FROM events WHERE id = $1)`,
    [b.eventId as number, String(b.channel), b.context === 'live' ? 'live' : 'event', Date.now()]);
  return NextResponse.json({ ok: true });
}
