import Link from 'next/link';
import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { FavList } from '@/components/Favorites';
import { liveEvents, searchEvents } from '@/lib/queries';
import { SITE_NAME, SITE_NAME_KANA, UNOFFICIAL } from '@/lib/site';
import SearchSuggest from '@/components/SearchSuggest';
import KindIcon from '@/components/Icon';
import type { EventCard as EventCardT } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}（${SITE_NAME_KANA}）｜イベント会場の「今」がわかる。駐車場・トイレ・シャトルバスの混雑${UNOFFICIAL ? '【非公式】' : ''}` },
  description: '駐車場・トイレ・シャトルバス・周辺道路。イベント当日のリアルな混雑情報を、来場者どうしで共有するサービスです。イベント名や地域で探せます。',
  alternates: { canonical: '/' },
};

/** 注目のイベントは少しだけ（ポータルにしない）。現地の投稿がある → 開催中 → 近日開催の順に、実際のデータから */
const FEATURED_MAX = 6;

/** イベナウで確認できる情報（何が分かるサービスかを最初に伝える） */
const INFO: { slug: string; title: string; sub: string }[] = [
  { slug: 'parking', title: '駐車場', sub: '空き状況・満車情報' },
  { slug: 'toilet', title: 'トイレ', sub: '待ち時間・混雑状況' },
  { slug: 'shuttle', title: 'シャトルバス', sub: '乗り場・待ち時間' },
  { slug: 'traffic', title: '周辺道路', sub: '交通規制（公式の案内）' },
];

export default async function Home() {
  const [live, today, upcoming] = await Promise.all([
    liveEvents(),
    searchEvents({ when: 'today', limit: FEATURED_MAX }),
    searchEvents({ when: 'upcoming', limit: FEATURED_MAX }),
  ]);
  const seen = new Set<number>();
  const featured: EventCardT[] = [];
  for (const e of [...live, ...today, ...upcoming]) {
    if (featured.length >= FEATURED_MAX || seen.has(e.id) || e.status === 'canceled') continue; // 中止のイベントは紹介しない
    seen.add(e.id); featured.push(e);
  }

  return (
    <div className="container hero-wrap home">
      {/* ② メインビジュアル：何のサービスかと、イベント検索 */}
      <section className="hero">
        <div className="hero-copy">
          {UNOFFICIAL && <span className="unofficial-note">非公式</span>}
          <h1>イベント会場の<br className="sp-only" />「今」がわかる。</h1>
          <p>駐車場・トイレ・シャトルバス・周辺道路。<br />イベント当日のリアルな混雑情報を共有。</p>
        </div>
        <form action="/search" className="search-box">
          <SearchSuggest placeholder="イベント名・地域・都道府県で探す" label="キーワード" />
          <button className="btn pop" type="submit">検索</button>
        </form>
      </section>

      <FavList />

      {/* ③ イベナウで確認できる情報 */}
      <section className="section">
        <div className="section-head"><h2>イベナウで確認できる情報</h2></div>
        <div className="home-info">
          {INFO.map((x) => (
            <div key={x.slug} className={`home-info-item ${x.slug}`}>
              <span className="hi-icon"><KindIcon kind="category" slug={x.slug} emoji="" size={22} strokeWidth={2.4} /></span>
              <strong>{x.title}</strong>
              <span>{x.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ④ 注目のイベント（実際のデータだけ。無ければ出さない） */}
      {featured.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>注目のイベント</h2><Link href="/search">すべて見る</Link></div>
          <p className="muted small home-lead">開催中・開催が近いイベントや、現地から投稿があるイベントを紹介しています。</p>
          <ItemList events={featured} empty="" />
        </section>
      )}

      {/* ⑤ イベナウの使い方 */}
      <section className="section">
        <div className="section-head"><h2>イベナウの使い方</h2></div>
        <ol className="home-steps">
          <li><span className="hs-n">1</span><div><strong>イベントを探す</strong><span>イベント名や地域で検索</span></div></li>
          <li><span className="hs-n">2</span><div><strong>現地の混雑を確認する</strong><span>駐車場・トイレの状況と地図を見る</span></div></li>
          <li><span className="hs-n">3</span><div><strong>見た状況を投稿する</strong><span>ワンタップ・登録不要・匿名</span></div></li>
        </ol>
      </section>

      {/* ⑥ イベナウについて */}
      <section className="section home-about">
        <div className="section-head"><h2>イベナウについて</h2></div>
        <p>イベナウは、全国のイベント当日の混雑情報を参加者同士で共有できるサービスです。公式情報だけでは分からない現地の状況を、来場者の投稿によって共有します。</p>
        <p className="small muted">来場者の投稿と、公式サイトなどの公式情報は分けて表示しています。{UNOFFICIAL && 'イベナウは非公式のサービスで、各イベントの主催者・会場とは関係がありません。'}最新・正確な情報は、必ず各イベントの公式サイトでご確認ください。</p>
        <p><Link href="/about" className="home-more">くわしく見る →</Link></p>
      </section>
    </div>
  );
}
