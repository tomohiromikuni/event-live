import type { Metadata } from 'next';
import { EventView, eventMetadata } from '../../../events/[slug]/view';

export const dynamic = 'force-dynamic';

/** 英語版のイベントページ（中身は日本語版と共通。lang='en'） */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return eventMetadata((await params).slug, 'en');
}

export default async function EventPageEn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  return EventView({ slug: (await params).slug, searchParams, lang: 'en' });
}
