import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { eventsBySlugs, searchEvents } from '@/lib/queries';
import { applyLang } from '@/lib/translate';
import { suggestEvents } from '@/lib/suggest';
import SearchSuggest from '@/components/SearchSuggest';
import { getLang } from '@/lib/lang';
import { lp, makeTx } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: makeTx(await getLang())('Search events | EVENOW') }, robots: { index: false, follow: true } };
}

/** 外国語版の検索（その言語の名前・地名でも、日本語でも探せる） */
export default async function SearchForeign({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const lang = await getLang(), tx = makeTx(lang);
  const qs = (await searchParams).q?.slice(0, 100) ?? '';
  const results = qs.trim()
    ? await eventsBySlugs((await suggestEvents(qs, 50, lang)).map((x) => x.slug))
    : await searchEvents({ limit: 100 });
  const list = await applyLang(results, lang);
  return (
    <div className="container">
      <h1 className="page-title">{tx('Find an event')}</h1>
      <form className="filters" action={`${lp(lang)}/search`}>
        <div className="search-box">
          <SearchSuggest defaultValue={qs} placeholder={tx('Event or place name (e.g. Sapporo)')} label={tx('Search')} lang={lang} />
          <button className="btn pop" type="submit">{tx('Search')}</button>
        </div>
      </form>
      <div className="section-head result-head"><h2>{qs ? `“${qs}”` : tx('Upcoming events')}<span className="count-badge">{list.length}</span></h2></div>
      <ItemList events={list} empty={qs ? tx('No events found for “{q}” yet.', { q: qs }) : tx('No events yet.')} lang={lang} />
    </div>
  );
}
