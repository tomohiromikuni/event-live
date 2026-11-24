import Link from 'next/link';
import type { Metadata } from 'next';
import { ItemList } from '@/components/EventCard';
import { listGenres, searchEvents } from '@/lib/queries';
import { PREFECTURES } from '@/lib/prefectures';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'イベントを探す' };

type SP = { q?: string; genre?: string; pref?: string; when?: string; date?: string };
const WHEN_LABEL: Record<string, string> = { today: '今日', weekend: '今週末', upcoming: '今後' };

function href(base: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  return `/search?${p.toString()}`;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params: SP = { q: sp.q?.slice(0, 100), genre: sp.genre, pref: sp.pref, when: sp.date ? undefined : sp.when, date: sp.date };
  if (params.date && !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) params.date = undefined;
  const [genres, results] = await Promise.all([listGenres(), searchEvents({ ...params, limit: 100 })]);
  const genre = genres.find((g) => g.slug === params.genre);
  const conds = [params.q && `「${params.q}」`, genre?.name, params.pref, params.when && WHEN_LABEL[params.when], params.date].filter(Boolean);

  return (
    <div className="container">
      <h1 className="page-title">イベントを探す</h1>
      <form className="filters" action="/search">
        <div className="search-box">
          <input name="q" type="search" defaultValue={params.q} placeholder="イベント名・地域・会場" aria-label="キーワード" />
          <button className="btn pop" type="submit">検索</button>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="pref">都道府県</label>
            <select id="pref" name="pref" defaultValue={params.pref ?? ''}>
              <option value="">すべて</option>
              {PREFECTURES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">開催日</label>
            <input id="date" name="date" type="date" defaultValue={params.date ?? ''} />
          </div>
        </div>
        {params.genre && <input type="hidden" name="genre" value={params.genre} />}
        {params.when && !params.date && <input type="hidden" name="when" value={params.when} />}
      </form>

      <nav className="chips" aria-label="期間">
        <Link className={`chip ${!params.when && !params.date ? 'active' : ''}`} href={href(params, { when: undefined, date: undefined })}>すべて</Link>
        {Object.entries(WHEN_LABEL).map(([k, v]) => (
          <Link key={k} className={`chip ${params.when === k ? 'active' : ''}`} href={href(params, { when: k, date: undefined })}>{v}</Link>
        ))}
      </nav>
      <nav className="chips" aria-label="ジャンル" style={{ paddingTop: 0 }}>
        <Link className={`chip ${!params.genre ? 'active' : ''}`} href={href(params, { genre: undefined })}>全ジャンル</Link>
        {genres.map((g) => (
          <Link key={g.id} className={`chip ${params.genre === g.slug ? 'active' : ''}`} href={href(params, { genre: g.slug })}>
            <span className="chip-dot" style={{ background: g.color }} aria-hidden />{g.name}
          </Link>
        ))}
      </nav>

      <div className="section-head result-head">
        <h2>{conds.length ? conds.join('・') : '開催予定のイベント'}<span className="count-badge">{results.length}件</span></h2>
        {conds.length > 0 && <Link href="/search">条件をクリア</Link>}
      </div>
      <ItemList events={results} empty="条件に一致するイベントは見つかりませんでした" />
    </div>
  );
}
