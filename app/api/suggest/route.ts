import { NextResponse } from 'next/server';
import { suggestEvents } from '@/lib/suggest';
import { isLang } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 検索欄の予測候補（?q= が空なら開催中・近日のものを出す） */
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.get('q') ?? '';
  const l = new URL(req.url).searchParams.get('lang');
  const lang = isLang(l) ? l : 'ja';
  const items = await suggestEvents(qs.slice(0, 60), 8, lang).catch(() => []);
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=30' } });
}
