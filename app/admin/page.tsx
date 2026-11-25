import Link from 'next/link';
import { q } from '@/lib/db';
import { resetSamples } from './actions';
import { addDays, fmtRange, isEnded, todayJST } from '@/lib/dates';
import { pendingCounts } from '@/lib/admin-data';

type Row = { id: number; slug: string; name: string; start_date: string; end_date: string; prefecture: string; status: string;
  is_sample: number; published: number; genre: string; spots: number; flags: number;
  views: number; visitors: number; posts: number };

/** 集計期間 */
const PERIODS = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7', label: '7日', days: 7 },
  { key: '30', label: '30日', days: 30 },
  { key: 'all', label: '全期間', days: 0 },
] as const;
/** 並べ替え */
const SORTS = {
  date: 'e.start_date DESC, e.id DESC',
  views: 'views DESC, visitors DESC, e.start_date DESC',
  posts: 'posts DESC, views DESC, e.start_date DESC',
} as const;
type SP = { q?: string; reset?: string; p?: string; s?: string };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kw = sp.q ?? '';
  const period = PERIODS.find((x) => x.key === sp.p) ?? PERIODS[1];
  const sort = (sp.s && sp.s in SORTS ? sp.s : 'date') as keyof typeof SORTS;
  // 期間の始まり（日本時間の0時）。全期間は制限なし
  const sinceDay = period.days ? addDays(todayJST(), -(period.days - 1)) : '0000-00-00';
  const sinceMs = period.days ? Date.parse(`${sinceDay}T00:00:00+09:00`) : 0;

  const rows = await q<Row>(`SELECT e.id, e.slug, e.name, e.start_date, e.end_date, e.prefecture, e.status, e.is_sample, e.published,
      g.name AS genre,
      (SELECT COUNT(*)::int FROM spots s WHERE s.event_id = e.id) AS spots,
      (SELECT COUNT(*)::int FROM report_flags f JOIN reports r ON r.id = f.report_id WHERE r.event_id = e.id AND f.resolved = 0) AS flags,
      COALESCE((SELECT SUM(v.views)::int FROM event_views v WHERE v.event_id = e.id AND v.day >= $2), 0) AS views,
      COALESCE((SELECT SUM(v.visitors)::int FROM event_views v WHERE v.event_id = e.id AND v.day >= $2), 0) AS visitors,
      (SELECT COUNT(*)::int FROM reports r WHERE r.event_id = e.id AND r.hidden = 0 AND r.created_at >= $3) AS posts
    FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.name ILIKE $1
    ORDER BY ${SORTS[sort]} LIMIT 200`, [`%${kw}%`, sinceDay, sinceMs]);

  const total = rows.reduce((t, r) => ({ views: t.views + r.views, visitors: t.visitors + r.visitors, posts: t.posts + r.posts }), { views: 0, visitors: 0, posts: 0 });
  const pending = await pendingCounts();
  const todo = [
    pending.removals ? { href: '/admin/removals', label: `削除依頼 ${pending.removals}件` } : null,
    pending.inquiries ? { href: '/admin/inquiries', label: `問い合わせ ${pending.inquiries}件` } : null,
  ].filter((x): x is { href: string; label: string } => !!x);

  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { q: kw || undefined, p: period.key === '7' ? undefined : period.key, s: sort === 'date' ? undefined : sort, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin?${qs}` : '/admin';
  };
  const sortHead = (key: keyof typeof SORTS, label: string, className?: string) => (
    <th className={className} aria-sort={sort === key ? 'descending' : undefined}>
      <Link href={link({ s: key === 'date' ? undefined : key })} className={`sort-link${sort === key ? ' on' : ''}`}>{label}{sort === key ? ' ↓' : ''}</Link>
    </th>
  );
  const fmt = (n: number) => n.toLocaleString('ja-JP');

  return (
    <>
      {todo.length > 0 && (
        <div className="admin-todo">
          <strong>未対応</strong>
          {todo.map((t, i) => <span key={t.label}>{i > 0 && <span className="sep">／</span>}<Link href={t.href}>{t.label}</Link></span>)}
        </div>
      )}
      <div className="admin-head">
        <h1>イベント <span className="muted">{rows.length}件</span></h1>
        <form>
          <input className="input" name="q" defaultValue={kw} placeholder="イベント名で絞り込み" aria-label="イベント名で絞り込み" />
          {period.key !== '7' && <input type="hidden" name="p" value={period.key} />}
          {sort !== 'date' && <input type="hidden" name="s" value={sort} />}
        </form>
        <div className="admin-head-actions">
          <Link className="btn ghost sm" href="/admin/import">下書きを貼り付け</Link>
          <Link className="btn sm" href="/admin/events/new">＋ 新規登録</Link>
        </div>
      </div>

      <div className="admin-stats">
        <nav className="seg" aria-label="集計期間">
          {PERIODS.map((x) => (
            <Link key={x.key} href={link({ p: x.key === '7' ? undefined : x.key })} className={x.key === period.key ? 'on' : undefined}
              aria-current={x.key === period.key ? 'true' : undefined}>{x.label}</Link>
          ))}
        </nav>
        <span>閲覧 <strong>{fmt(total.views)}</strong></span>
        <span>見た人 <strong>{fmt(total.visitors)}</strong></span>
        <span>投稿 <strong>{fmt(total.posts)}</strong></span>
        <span className="muted small">（{period.days ? `${sinceDay.slice(5).replace('-', '/')}〜今日` : '記録開始から'}・管理者の閲覧と検索ロボットは除く）</span>
      </div>

      <div className="table-wrap">
        <table className="table events-table">
          <thead>
            <tr>
              <th>イベント</th>
              {sortHead('date', '開催日')}
              <th>状態</th><th>地域</th><th className="num">地点</th>
              {sortHead('views', '閲覧', 'num')}
              <th className="num">見た人</th>
              {sortHead('posts', '投稿', 'num')}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/events/${r.id}`} className="admin-name">{r.name}</Link>
                  {r.is_sample ? <span className="tag sample">サンプル</span> : null}
                  {isEnded(r.end_date) ? <span className="tag" title="公開ページでは「終了しました」の案内だけを表示しています">終了</span> : null}
                  {!r.published && <span className="tag">非公開</span>}
                  <div className="muted small">{r.genre}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(r.start_date, r.end_date)}</td>
                <td>{{ scheduled: '開催予定', canceled: '中止', postponed: '延期' }[r.status]}</td>
                <td>{r.prefecture}</td>
                <td className="num">{r.spots}</td>
                <td className="num">{r.views ? <strong>{fmt(r.views)}</strong> : <span className="muted">0</span>}</td>
                <td className="num">{r.visitors ? fmt(r.visitors) : <span className="muted">0</span>}</td>
                <td className="num">{r.posts ? <Link href={`/admin/reports?event=${r.id}`}>{fmt(r.posts)}</Link> : <span className="muted">0</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Link href={`/admin/events/${r.id}`}>編集</Link>{'　'}
                  <Link href={`/events/${r.slug}`} target="_blank">表示 ↗</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sp.reset && <div className="flash">サンプルデータを今日基準の日程で作り直しました</div>}
      <form action={resetSamples} className="admin-foot-note">
        サンプルデータ：<button className="linklike">今日を基準に作り直す</button>（サンプルイベントだけを削除して作り直します。実イベントには影響しません）
      </form>
    </>
  );
}
