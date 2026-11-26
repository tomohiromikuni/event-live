import Link from 'next/link';
import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { searchEvents } from '@/lib/queries';
import { applyLang } from '@/lib/translate';
import SearchSuggest from '@/components/SearchSuggest';
import { getLang } from '@/lib/lang';
import { altLanguages, lp, makeTx } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang(), tx = makeTx(lang);
  return {
    title: { absolute: tx('EVENOW (unofficial): live parking, toilets & crowds at events in Japan') },
    description: tx('See what is happening right now at festivals, fireworks and events across Japan — parking, shuttle buses and toilet lines, shared live by visitors. Unofficial.'),
    alternates: { canonical: lp(lang), languages: altLanguages('/') },
  };
}

/** 外国語版のトップ（英語・中国語・韓国語） */
export default async function HomeForeign() {
  const lang = await getLang(), tx = makeTx(lang), base = lp(lang);
  const [today, upcoming] = await Promise.all([searchEvents({ when: 'today', limit: 20 }), searchEvents({ when: 'upcoming', limit: 12 })]);
  const [todayL, upcomingL] = await Promise.all([applyLang(today, lang), applyLang(upcoming, lang)]);
  return (
    <div className="container hero-wrap">
      <section className="hero">
        <div className="hero-copy">
          <span className="unofficial-note">{tx('Unofficial')}</span>
          <h1>{tx("Know what's happening at the venue now.")}</h1>
          <p>{tx('Parking, shuttle buses and toilet lines at events in Japan — shared live by visitors.')}</p>
        </div>
        <form action={`${base}/search`} className="search-box">
          <SearchSuggest placeholder={tx('Event or place name')} label={tx('Search')} lang={lang} />
          <button className="btn pop" type="submit">{tx('Search')}</button>
        </form>
      </section>
      <a className="jp-tips" href={`${base}/guide`} style={{ marginTop: 14 }}>
        <b>{tx('🇯🇵 First time at a Japanese event?')}</b>
        <span>{tx('Toilet etiquette, trash rules, IC cards and saving a spot for fireworks.')}</span>
        <span className="go">{tx('Read the tips →')}</span>
      </a>
      <section className="section">
        <div className="section-head"><h2>{tx('Happening now')}</h2><Link href={`${base}/search`}>{tx('See all')}</Link></div>
        <ItemList events={todayL} empty={tx('No events are happening right now.')} lang={lang} />
      </section>
      <section className="section">
        <div className="section-head"><h2>{tx('Coming up')}</h2></div>
        <ItemList events={upcomingL} empty={tx('No upcoming events yet.')} lang={lang} />
      </section>
    </div>
  );
}
