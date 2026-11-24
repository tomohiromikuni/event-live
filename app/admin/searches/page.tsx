import Link from 'next/link';
import { q } from '@/lib/db';
import { addDays, todayJST } from '@/lib/dates';

type Row = { query: string; searches: number; zero_results: number; last_day: string };

const PERIODS = [
  { key: '7', label: '7日', days: 7 },
  { key: '30', label: '30日', days: 30 },
  { key: 'all', label: '全期間', days: 0 },
] as const;

/**
 * サイト内検索で使われた言葉。
 * 「結果が0件だった言葉」は、探されているのに載っていないイベント＝次に登録する候補。
 */
export default async function AdminSearches({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const period = PERIODS.find((x) => x.key === sp.p) ?? PERIODS[1];
  const since = period.days ? addDays(todayJST(), -(period.days - 1)) : '0000-00-00';
  const rows = await q<Row>(`SELECT query, SUM(searches)::int AS searches, SUM(zero_results)::int AS zero_results, MAX(day) AS last_day
    FROM search_queries WHERE day >= $1 GROUP BY query ORDER BY searches DESC, last_day DESC LIMIT 300`, [since]);
  const zero = rows.filter((r) => r.zero_results > 0).sort((a, b) => b.zero_results - a.zero_results || b.last_day.localeCompare(a.last_day));
  const total = rows.reduce((t, r) => t + r.searches, 0);
  const md = (d: string) => d.slice(5).replace('-', '/');

  return (
    <>
      <div className="admin-head">
        <h1>検索ワード</h1>
        <nav className="seg" aria-label="集計期間">
          {PERIODS.map((x) => (
            <Link key={x.key} href={x.key === '30' ? '/admin/searches' : `/admin/searches?p=${x.key}`} className={x.key === period.key ? 'on' : undefined}
              aria-current={x.key === period.key ? 'true' : undefined}>{x.label}</Link>
          ))}
        </nav>
        <span className="muted small">検索 {total.toLocaleString('ja-JP')}回（管理者の検索と検索ロボットは除く）</span>
      </div>

      <section className="panel" style={{ marginTop: 0 }}>
        <h2>結果が0件だった言葉 <span className="muted" style={{ fontWeight: 400 }}>{zero.length}件</span></h2>
        <p className="muted small" style={{ marginTop: 0 }}>探されているのに載っていないイベントです。次に登録するイベントを選ぶ参考にしてください。</p>
        {zero.length === 0 ? <p className="muted small">まだありません</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>言葉</th><th className="num">0件だった回数</th><th className="num">検索回数</th><th>最後の検索</th><th /></tr></thead>
              <tbody>
                {zero.map((r) => (
                  <tr key={r.query}>
                    <td><strong>{r.query}</strong></td>
                    <td className="num" style={{ color: 'var(--danger)', fontWeight: 700 }}>{r.zero_results}</td>
                    <td className="num">{r.searches}</td>
                    <td>{md(r.last_day)}</td>
                    <td style={{ textAlign: 'right' }}><Link href={`/search?q=${encodeURIComponent(r.query)}`} target="_blank">公開サイトで検索 ↗</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>よく検索された言葉</h2>
        {rows.length === 0 ? <p className="muted small">まだ記録がありません</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>言葉</th><th className="num">検索回数</th><th className="num">うち0件</th><th>最後の検索</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.query}>
                    <td>{r.query}</td>
                    <td className="num"><strong>{r.searches}</strong></td>
                    <td className="num" style={{ color: r.zero_results ? 'var(--danger)' : 'var(--muted)' }}>{r.zero_results}</td>
                    <td>{md(r.last_day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
