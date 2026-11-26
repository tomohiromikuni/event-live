import { NextResponse } from 'next/server';
import { suggestEvents } from '@/lib/suggest';

export const dynamic = 'force-dynamic';

/** 検索欄の予測候補（?q= が空なら開催中・近日のものを出す） */
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.get('q') ?? '';
  const items = await suggestEvents(qs.slice(0, 60)).catch(() => []);
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=30' } });
}
