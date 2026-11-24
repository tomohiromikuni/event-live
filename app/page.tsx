import Link from 'next/link';
import EventCard, { CardRow, ItemList } from '@/components/EventCard';
import { featuredEvents, listGenres, liveEvents, prefectureCounts, searchEvents } from '@/lib/queries';
import { REGIONS } from '@/lib/prefectures';
import { UNOFFICIAL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [genres, live, today, weekend, featured, upcoming, prefCounts] = await Promise.all([
    listGenres(),
    liveEvents(),
    searchEvents({ when: 'today', limit: 20 }),
    searchEvents({ when: 'weekend', limit: 20 }),
    featuredEvents(),
    searchEvents({ when: 'upcoming', limit: 12 }),
    prefectureCounts(),
  ]);

  return (
    <>
      <div className="container hero-wrap">
        <section className="hero">
          <div className="hero-copy">
            {UNOFFICIAL && <span className="unofficial-note">非公式・主催者とは無関係</span>}
            <h1>イベントの<br className="sp-only" />「今」が<br className="sp-only" />わかる。</h1>
            <p>混雑・待ち時間・駐車場を、<br />来場者がリアルタイムで投稿。</p>
          </div>
          <form action="/search" className="search-box">
            <input name="q" type="search" placeholder="イベント名・地域・会場" aria-label="キーワード" />
            <button className="btn pop" type="submit">検索</button>
          </form>
        </section>

        <nav className="when-links" aria-label="いつ">
          <Link href="/search?when=today">今日</Link>
          <Link href="/search?when=weekend">今週末</Link>
          <Link href="/search?when=upcoming">今後</Link>
        </nav>

        <nav className="chips" aria-label="ジャンル" style={{ marginTop: 6 }}>
          {genres.map((g) => (
            <Link key={g.id} href={`/search?genre=${g.slug}`} className="chip">
              <span className="chip-dot" style={{ background: g.color }} aria-hidden />{g.name}
            </Link>
          ))}
        </nav>

        {live.length > 0 && (
          <section className="section" style={{ marginTop: 18 }}>
            <div className="section-head"><h2><span className="live-dot" />いま、現地が盛り上がり中</h2></div>
            <EventCard e={live[0]} hero />
            {live.length > 1 && <div style={{ marginTop: 14 }}><CardRow events={live.slice(1)} empty="" /></div>}
          </section>
        )}

        <section className="section">
          <div className="section-head"><h2>今日開催</h2><Link href="/search?when=today">すべて見る</Link></div>
          <ItemList events={today} empty="今日開催のイベントは登録されていません" />
        </section>

        <section className="section">
          <div className="section-head"><h2>今週末</h2><Link href="/search?when=weekend">すべて見る</Link></div>
          <CardRow events={weekend} empty="今週末のイベントは登録されていません" />
        </section>

        <section className="section">
          <div className="section-head"><h2>注目のイベント</h2></div>
          <CardRow events={featured} empty="注目イベントはありません" />
        </section>

        <section className="section">
          <div className="section-head"><h2>今後の予定</h2><Link href="/search?when=upcoming">すべて見る</Link></div>
          <ItemList events={upcoming} empty="今後の予定はまだ登録されていません" />
        </section>

        <section className="section">
          <div className="section-head"><h2>都道府県から探す</h2></div>
          {REGIONS.map((r) => (
            <div key={r.name} className="pref-region">
              <h3>{r.name}</h3>
              <div className="pref-list">
                {r.prefs.map((p) => (
                  <Link key={p} href={`/search?pref=${encodeURIComponent(p)}`} className={prefCounts[p] ? 'has' : 'none'}>
                    {p.replace(/[都府県]$/, '')}{prefCounts[p] ? ` ${prefCounts[p]}` : ''}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
