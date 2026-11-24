import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { q, tx } from '@/lib/db';
import { todayJST, addDays } from '@/lib/dates';
import { isAdmin } from '@/lib/admin';
import { ipHash } from '@/lib/posting';
import { currentClientId } from '@/lib/contrib';

const BOT_RE = /bot|crawler|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

/**
 * イベントページの閲覧を1回記録する（管理画面のアナリティクス用）。
 * ブラウザでページが表示されたときだけ送られる（検索ロボット・リンクの先読みは数えない）。
 * 管理者としてログイン中の閲覧は数えない。
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { eventId?: unknown } | null;
  if (!b || !Number.isInteger(b.eventId)) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = (await headers()).get('user-agent') ?? '';
  if (!ua || BOT_RE.test(ua) || (await isAdmin())) return NextResponse.json({ ok: true, counted: false });

  const eventId = b.eventId as number;
  const day = todayJST();
  const viewer = (await currentClientId()) ?? `ip:${await ipHash()}`;
  await tx(async (tq) => {
    const exists = await tq('SELECT 1 FROM events WHERE id = $1 AND published = 1', [eventId]);
    if (exists.length === 0) return;
    const isNew = (await tq(`INSERT INTO event_view_seen (event_id, day, viewer) VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING RETURNING 1`, [eventId, day, viewer])).length > 0;
    await tq(`INSERT INTO event_views (event_id, day, views, visitors) VALUES ($1, $2, 1, $3)
      ON CONFLICT (event_id, day) DO UPDATE SET views = event_views.views + 1, visitors = event_views.visitors + $3`,
      [eventId, day, isNew ? 1 : 0]);
  });
  // 見分け用の行は前日分まであれば足りるので、ときどき古いものを消す
  if (Math.random() < 0.02) await q('DELETE FROM event_view_seen WHERE day < $1', [addDays(day, -2)]);
  return NextResponse.json({ ok: true, counted: true });
}
