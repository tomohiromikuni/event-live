import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { eventsBySlugs, searchEvents } from '@/lib/queries';
import { applyEn } from '@/lib/translate';
import { suggestEvents } from '@/lib/suggest';
import SearchSuggest from '@/components/SearchSuggest';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'Find an event | EVENOW (unofficial)' }, robots: { index: false, follow: true } };

/** 英語版の検索（英語の名前・地名でも、日本語でも探せる） */
export default async function SearchEn({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const qs = (await searchParams).q?.slice(0, 100) ?? '';
  const results = qs.trim()
    ? await eventsBySlugs((await suggestEvents(qs, 50, 'en')).map((x) => x.slug))
    : await searchEvents({ limit: 100 });
  const list = await applyEn(results);
  return (
    <div className="container">
      <h1 className="page-title">Find an event</h1>
      <form className="filters" action="/en/search">
        <div className="search-box">
          <SearchSuggest defaultValue={qs} placeholder="Event or place name (e.g. Sapporo)" label="Search" lang="en" />
          <button className="btn pop" type="submit">Search</button>
        </div>
      </form>
      <div className="section-head result-head"><h2>{qs ? `“${qs}”` : 'Upcoming events'}<span className="count-badge">{list.length}</span></h2></div>
      <ItemList events={list} empty={qs ? `No events found for “${qs}” yet.` : 'No events yet.'} lang="en" />
    </div>
  );
}
