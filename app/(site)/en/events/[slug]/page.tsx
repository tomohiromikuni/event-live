import type { Metadata } from 'next';
import { EventView, eventMetadata } from '../../../events/[slug]/view';
import { getLang } from '@/lib/lang';

export const dynamic = 'force-dynamic';

/** 外国語版のイベントページ（/en・/zh・/zh-tw・/ko。中身は日本語版と共通。言語は middleware.ts が伝える） */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return eventMetadata((await params).slug, await getLang());
}

export default async function EventPageForeign({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  return EventView({ slug: (await params).slug, searchParams, lang: await getLang() });
}
