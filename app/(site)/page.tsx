import Link from 'next/link';
import EventCard, { CardRow, ItemList } from '@/components/EventCard';
import { latestSpotStatuses, liveEvents, searchEvents } from '@/lib/queries';
import { UNOFFICIAL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // トップは「イベント名で検索」が主役。一覧は開催中と近日開催だけに絞る（会場マップのあるイベントだけを掲載する方針）
  const [live, today, upcoming] = await Promise.all([
    liveEvents(),
    searchEvents({ when: 'today', limit: 20 }),
    searchEvents({ when: 'upcoming', limit: 12 }),
  ]);
  // いちばん投稿の多いイベントは、地点ごとのいまの状況もカードに出す
  const statuses = live[0] ? await latestSpotStatuses([live[0].id]) : {};
  const now = Date.now();

  return (
    <>
      <div className="container hero-wrap">
        <section className="hero">
          <div className="hero-copy">
            {UNOFFICIAL && <span className="unofficial-note">非公式</span>}
            <h1>イベントの<br className="sp-only" />「今」が<br className="sp-only" />わかる。</h1>
            <p>駐車場・シャトルバス・トイレの混雑を、<br />来場者がリアルタイムで投稿。</p>
          </div>
          <form action="/search" className="search-box">
            <input name="q" type="search" placeholder="イベント名で探す" aria-label="キーワード" />
            <button className="btn pop" type="submit">検索</button>
          </form>
        </section>



        {live.length > 0 && (
          <section className="section" style={{ marginTop: 18 }}>
            <div className="section-head"><h2><span className="live-dot" />いま、現地から投稿があるイベント</h2></div>
            <EventCard e={live[0]} hero statuses={statuses[live[0].id]} now={now} />
            {live.length > 1 && <div style={{ marginTop: 14 }}><CardRow events={live.slice(1)} empty="" /></div>}
          </section>
        )}

        <section className="section">
          <div className="section-head"><h2>開催中</h2><Link href="/search?when=today">すべて見る</Link></div>
          <ItemList events={today} empty="いま開催中のイベントはありません" />
        </section>



        <section className="section">
          <div className="section-head"><h2>近日開催</h2><Link href="/search?when=upcoming">すべて見る</Link></div>
          <ItemList events={upcoming} empty="近日開催のイベントはまだありません" />
        </section>

      </div>
    </>
  );
}
