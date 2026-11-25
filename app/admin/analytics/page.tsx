import Link from 'next/link';
import { q } from '@/lib/db';
import { addDays, todayJST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const PERIODS = [
  { key: '7', label: '7日', days: 7 },
  { key: '30', label: '30日', days: 30 },
  { key: '90', label: '90日', days: 90 },
] as const;

/**
 * アナリティクス（EVENOW が自分で記録している数字だけ。推測値は出さない）
 * - 閲覧：イベントページの表示（ブラウザで表示されたときだけ。検索ロボット・管理者は数えない）／見た人＝1人1日1回
 * - 投稿：来場者のワンタップ投稿（非表示にしたものを除く）
 * - 検索：サイト内検索で使われた言葉／共有：共有ボタンと共有リンクからの訪問
 * Google 検索での表示回数・クリック数は Google Search Console で見る。
 */
export default async function Analytics({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const period = PERIODS.find((x) => x.key === p) ?? PERIODS[1];
  const today = todayJST();
  const sinceDay = addDays(today, -(period.days - 1));
  const sinceMs = Date.parse(`${sinceDay}T00:00:00+09:00`);
  const prevDay = addDays(sinceDay, -period.days), prevMs = Date.parse(`${prevDay}T00:00:00+09:00`);

  const [[sum], [prev], daily, top, words, zero, [share], [inq]] = await Promise.all([
    q<{ views: number; visitors: number; posts: number; posters: number }>(`SELECT
      (SELECT COALESCE(SUM(views), 0)::int FROM event_views WHERE day >= $1) AS views,
      (SELECT COALESCE(SUM(visitors), 0)::int FROM event_views WHERE day >= $1) AS visitors,
      (SELECT COUNT(*)::int FROM reports WHERE hidden = 0 AND created_at >= $2 AND ip_hash <> 'seed') AS posts,
      (SELECT COUNT(DISTINCT client_id)::int FROM reports WHERE hidden = 0 AND created_at >= $2 AND ip_hash <> 'seed') AS posters`, [sinceDay, sinceMs]),
    q<{ views: number; posts: number }>(`SELECT
      (SELECT COALESCE(SUM(views), 0)::int FROM event_views WHERE day >= $1 AND day < $2) AS views,
      (SELECT COUNT(*)::int FROM reports WHERE hidden = 0 AND created_at >= $3 AND created_at < $4 AND ip_hash <> 'seed') AS posts`, [prevDay, sinceDay, prevMs, sinceMs]),
    q<{ day: string; views: number; visitors: number; posts: number }>(`SELECT d.day,
        COALESCE((SELECT SUM(views) FROM event_views v WHERE v.day = d.day), 0)::int AS views,
        COALESCE((SELECT SUM(visitors) FROM event_views v WHERE v.day = d.day), 0)::int AS visitors,
        (SELECT COUNT(*) FROM reports r WHERE r.hidden = 0 AND r.ip_hash <> 'seed'
          AND r.created_at >= extract(epoch FROM (d.day || 'T00:00:00+09:00')::timestamptz) * 1000
          AND r.created_at < extract(epoch FROM (d.day || 'T00:00:00+09:00')::timestamptz) * 1000 + 86400000)::int AS posts
      FROM (SELECT to_char(generate_series($1::date, $2::date, '1 day'), 'YYYY-MM-DD') AS day) d ORDER BY d.day DESC`, [sinceDay, today]),
    q<{ id: number; name: string; views: number; visitors: number; posts: number }>(`SELECT e.id, e.name,
        COALESCE(SUM(v.views), 0)::int AS views, COALESCE(SUM(v.visitors), 0)::int AS visitors,
        (SELECT COUNT(*) FROM reports r WHERE r.event_id = e.id AND r.hidden = 0 AND r.created_at >= $2 AND r.ip_hash <> 'seed')::int AS posts
      FROM events e LEFT JOIN event_views v ON v.event_id = e.id AND v.day >= $1
      WHERE e.is_sample = 0 GROUP BY e.id HAVING COALESCE(SUM(v.views), 0) > 0 ORDER BY views DESC LIMIT 10`, [sinceDay, sinceMs]),
    q<{ query: string; n: number }>(`SELECT query, SUM(searches)::int AS n FROM search_queries WHERE day >= $1 GROUP BY query ORDER BY n DESC LIMIT 10`, [sinceDay]),
    q<{ query: string; n: number }>(`SELECT query, SUM(zero_results)::int AS n FROM search_queries WHERE day >= $1 GROUP BY query HAVING SUM(zero_results) > 0 ORDER BY n DESC LIMIT 10`, [sinceDay]),
    q<{ clicks: number; visits: number }>(`SELECT COUNT(*) FILTER (WHERE action = 'click')::int AS clicks, COUNT(*) FILTER (WHERE action = 'visit')::int AS visits
      FROM share_events WHERE created_at >= $1`, [sinceMs]),
    q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM inquiries WHERE created_at >= $1`, [sinceMs]),
  ]);
  const diff = (now: number, before: number) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}%` : '');
  const Stat = ({ label, value, sub }: { label: string; value: number; sub?: string }) => (
    <div><div className="muted small">{label}</div><div style={{ fontSize: 26, fontWeight: 800 }}>{value.toLocaleString()}</div>{sub && <div className="muted small">{sub}</div>}</div>
  );

  return (
    <>
      <div className="section-head">
        <h1 className="admin-title" style={{ margin: 0 }}>アナリティクス（直近{period.days}日）</h1>
        <span className="small">{PERIODS.map((x) => <Link key={x.key} href={`/admin/analytics?p=${x.key}`} style={{ marginLeft: 10, fontWeight: x.key === period.key ? 800 : 400 }}>{x.label}</Link>)}</span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        EVENOW が自分で記録している数字です（検索ロボット・管理者の閲覧は数えません）。Google 検索での表示回数・クリック数は
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Google Search Console</a> で確認できます。
      </p>

      <div className="panel" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 0 }}>
        <Stat label="イベントページの閲覧" value={sum.views} sub={diff(sum.views, prev.views) && `前の${period.days}日比 ${diff(sum.views, prev.views)}`} />
        <Stat label="見た人（1人1日1回）" value={sum.visitors} />
        <Stat label="現地の投稿" value={sum.posts} sub={diff(sum.posts, prev.posts) && `前の${period.days}日比 ${diff(sum.posts, prev.posts)}`} />
        <Stat label="投稿した人（端末）" value={sum.posters} />
        <Stat label="共有ボタン" value={share.clicks} sub={`共有リンクからの訪問 ${share.visits}`} />
        <Stat label="問い合わせ・申請" value={inq.n} />
      </div>

      <div className="panel">
        <h2>人気のイベント（閲覧の多い順）</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>イベント</th><th>閲覧</th><th>見た人</th><th>投稿</th></tr></thead>
          <tbody>
            {top.length === 0 && <tr><td colSpan={4} className="muted">まだ記録がありません</td></tr>}
            {top.map((r) => <tr key={r.id}><td><Link href={`/admin/events/${r.id}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{r.name}</Link></td><td>{r.views}</td><td>{r.visitors}</td><td>{r.posts}</td></tr>)}
          </tbody>
        </table></div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div>
          <h2 style={{ marginTop: 0 }}>よく検索された言葉</h2>
          {words.length === 0 ? <div className="muted small">まだありません</div> : <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{words.map((w) => <li key={w.query}>{w.query}（{w.n}回）</li>)}</ol>}
        </div>
        <div>
          <h2 style={{ marginTop: 0 }}>探されたのに載っていない言葉</h2>
          {zero.length === 0 ? <div className="muted small">ありません</div> : <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{zero.map((w) => <li key={w.query}>{w.query}（{w.n}回）</li>)}</ol>}
          <div className="muted small" style={{ marginTop: 6 }}>→ 掲載するイベントを選ぶ参考に。詳しくは <Link href="/admin/searches" style={{ textDecoration: 'underline' }}>検索ワード</Link></div>
        </div>
      </div>

      <div className="panel">
        <h2>日ごとの推移</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>日付</th><th>閲覧</th><th>見た人</th><th>投稿</th></tr></thead>
          <tbody>{daily.map((d) => <tr key={d.day}><td className="small">{d.day.slice(5).replace('-', '/')}</td><td>{d.views}</td><td>{d.visitors}</td><td>{d.posts}</td></tr>)}</tbody>
        </table></div>
      </div>
      <p className="muted small">イベントごとの詳しい数字は <Link href="/admin" style={{ textDecoration: 'underline' }}>イベント一覧</Link>、SNSの数字は <Link href="/admin/sns" style={{ textDecoration: 'underline' }}>SNS・シェア</Link> にあります。</p>
    </>
  );
}
