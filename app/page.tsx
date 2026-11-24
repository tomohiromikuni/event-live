import Link from 'next/link';
import { CardList, CardRow } from '@/components/EventCard';
import { featuredEvents, listGenres, liveEvents, prefectureCounts, searchEvents } from '@/lib/queries';
import { REGIONS } from '@/lib/prefectures';

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
      <section className="hero">
        <div className="container">
          <h1>イベントの「今」がわかる。</h1>
          <p>全国のイベント情報と、来場者が投稿する混雑・待ち時間・駐車場のリアルタイム情報</p>
          <form action="/search" className="search-box">
            <input name="q" type="search" placeholder="イベント名・地域・会場で検索" aria-label="キーワード" />
            <button className="btn light" type="submit">検索</button>
          </form>
          <div className="quick-links">
            <Link href="/search?when=today">📅 今日</Link>
            <Link href="/search?when=weekend">🗓️ 今週末</Link>
            <Link href="/search?when=upcoming">⏭️ 今後の予定</Link>
          </div>
        </div>
      </section>

      <div className="container">
        <nav className="chips" aria-label="ジャンル">
          {genres.map((g) => (
            <Link key={g.id} href={`/search?genre=${g.slug}`} className="chip">{g.icon} {g.name}</Link>
          ))}
        </nav>

        {live.length > 0 && (
          <section className="section">
            <div className="section-head"><h2><span className="live-dot" />いま現地情報が届いています</h2></div>
            <CardRow events={live} empty="" />
          </section>
        )}

        <section className="section">
          <div className="section-head"><h2>今日開催</h2><Link href="/search?when=today">すべて見る</Link></div>
          <CardList events={today} empty="今日開催のイベントは登録されていません" />
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
          <CardList events={upcoming} empty="今後の予定はまだ登録されていません" />
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
