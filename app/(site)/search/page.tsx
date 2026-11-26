import Link from 'next/link';
import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { listGenres, searchEvents } from '@/lib/queries';
import SearchBeacon from '@/components/SearchBeacon';
import SearchSuggest from '@/components/SearchSuggest';

export const dynamic = 'force-dynamic';
// 検索結果のページは中身が条件で変わる薄いページなので、検索エンジンには登録しない（リンク先のイベントページはたどってもらう）
export const metadata: Metadata = { title: 'イベントを探す', robots: { index: false, follow: true } };

type SP = { q?: string; genre?: string; pref?: string; when?: string; date?: string };
const WHEN_LABEL: Record<string, string> = { today: '今日', weekend: '今週末', upcoming: '今後' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params: SP = { q: sp.q?.slice(0, 100), genre: sp.genre, pref: sp.pref, when: sp.date ? undefined : sp.when, date: sp.date };
  if (params.date && !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) params.date = undefined;
  const [genres, results] = await Promise.all([listGenres(), searchEvents({ ...params, limit: 100 })]);
  const genre = genres.find((g) => g.slug === params.genre);
  const conds = [params.q && `「${params.q}」`, genre?.name, params.pref, params.when && WHEN_LABEL[params.when], params.date].filter(Boolean);

  return (
    <div className="container">
      {params.q ? <SearchBeacon q={params.q} count={results.length} /> : null}
      <h1 className="page-title">イベントを探す</h1>
      {/* 方針：イベント名で探して詳細ページへ。ジャンル・期間・都道府県の絞り込みは画面から外した（?pref= などのURLはそのまま使える） */}
      <form className="filters" action="/search">
        <div className="search-box">
          <SearchSuggest defaultValue={params.q ?? ''} placeholder="イベント名・地名で探す（例：札幌）" label="イベント名" />
          <button className="btn pop" type="submit">検索</button>
        </div>
      </form>

      <div className="section-head result-head">
        <h2>{conds.length ? conds.join('・') : '開催予定のイベント'}<span className="count-badge">{results.length}件</span></h2>
        {conds.length > 0 && <Link href="/search">条件をクリア</Link>}
      </div>
      {results.length > 0 ? <ItemList events={results} empty="" /> : (
        <div className="empty">
          {params.q ? <>「{params.q}」に一致するイベントは、まだ掲載していません。</> : '条件に一致するイベントは見つかりませんでした。'}
          <br /><span className="small">掲載してほしいイベントがあれば <Link href="/contact" style={{ textDecoration: 'underline' }}>お問い合わせ</Link> からお知らせください。</span>
        </div>
      )}
    </div>
  );
}
