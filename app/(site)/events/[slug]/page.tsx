import type { Metadata } from 'next';
import { EventView, eventMetadata } from './view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return eventMetadata((await params).slug, 'ja');
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  return EventView({ slug: (await params).slug, searchParams, lang: 'ja' });
}
