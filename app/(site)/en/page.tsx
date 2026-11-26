import Link from 'next/link';
import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { searchEvents } from '@/lib/queries';
import { applyEn } from '@/lib/translate';
import SearchSuggest from '@/components/SearchSuggest';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: 'EVENOW (unofficial): live parking, toilets & crowds at events in Japan' },
  description: 'See what is happening right now at festivals, fireworks and events across Japan — parking, shuttle buses and toilet lines, shared live by visitors. Unofficial.',
  alternates: { canonical: '/en', languages: { ja: '/', en: '/en' } },
};

/** 英語版のトップ */
export default async function HomeEn() {
  const [today, upcoming] = await Promise.all([searchEvents({ when: 'today', limit: 20 }), searchEvents({ when: 'upcoming', limit: 12 })]);
  const [todayEn, upcomingEn] = await Promise.all([applyEn(today), applyEn(upcoming)]);
  return (
    <div className="container hero-wrap">
      <section className="hero">
        <div className="hero-copy">
          <span className="unofficial-note">Unofficial</span>
          <h1>Know what&apos;s happening at the venue now.</h1>
          <p>Parking, shuttle buses and toilet lines at events in Japan — shared live by visitors.</p>
        </div>
        <form action="/en/search" className="search-box">
          <SearchSuggest placeholder="Event or place name" label="Search" lang="en" />
          <button className="btn pop" type="submit">Search</button>
        </form>
      </section>
      <a className="jp-tips" href="/en/guide" style={{ marginTop: 14 }}>
        <b>🇯🇵 First time at a Japanese event?</b>
        <span>Toilet etiquette, trash rules, IC cards and saving a spot for fireworks.</span>
        <span className="go">Read the tips →</span>
      </a>
      <section className="section">
        <div className="section-head"><h2>Happening now</h2><Link href="/en/search">See all</Link></div>
        <ItemList events={todayEn} empty="No events are happening right now." lang="en" />
      </section>
      <section className="section">
        <div className="section-head"><h2>Coming up</h2></div>
        <ItemList events={upcomingEn} empty="No upcoming events yet." lang="en" />
      </section>
    </div>
  );
}
