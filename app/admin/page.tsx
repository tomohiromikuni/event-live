import Link from 'next/link';
import { q } from '@/lib/db';
import { resetSamples } from './actions';
import { fmtRange } from '@/lib/dates';
import { pendingCounts } from '@/lib/admin-data';

type Row = { id: number; slug: string; name: string; start_date: string; end_date: string; prefecture: string; status: string;
  is_sample: number; published: number; genre: string; spots: number; reports: number; flags: number };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<{ q?: string; reset?: string }> }) {
  const { q: kw, reset } = await searchParams;
  const rows = await q<Row>(`SELECT e.id, e.slug, e.name, e.start_date, e.end_date, e.prefecture, e.status, e.is_sample, e.published,
      g.name AS genre,
      (SELECT COUNT(*)::int FROM spots s WHERE s.event_id = e.id) AS spots,
      (SELECT COUNT(*)::int FROM reports r WHERE r.event_id = e.id) AS reports,
      (SELECT COUNT(*)::int FROM report_flags f JOIN reports r ON r.id = f.report_id WHERE r.event_id = e.id AND f.resolved = 0) AS flags
    FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.name ILIKE $1 ORDER BY e.start_date DESC LIMIT 200`, [`%${kw ?? ''}%`]);
  const pending = await pendingCounts();
  const todo = [
    pending.removals ? { href: '/admin/inquiries', label: `掲載停止の申請 ${pending.removals}件` } : null,
    pending.flags ? { href: '/admin/reports?flagged=1', label: `通報 ${pending.flags}件` } : null,
    pending.inquiries ? { href: '/admin/inquiries', label: `問い合わせ ${pending.inquiries}件` } : null,
  ].filter((x): x is { href: string; label: string } => !!x);
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
        <form><input className="input" name="q" defaultValue={kw} placeholder="イベント名で絞り込み" aria-label="イベント名で絞り込み" /></form>
        <div className="admin-head-actions">
          <Link className="btn ghost sm" href="/admin/import">下書きを貼り付け</Link>
          <Link className="btn sm" href="/admin/events/new">＋ 新規登録</Link>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table events-table">
          <thead><tr><th>イベント</th><th>開催日</th><th>状態</th><th>地域</th><th className="num">地点</th><th className="num">投稿</th><th className="num">未対応通報</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/events/${r.id}`} className="admin-name">{r.name}</Link>
                  {r.is_sample ? <span className="tag sample">サンプル</span> : null}
                  {!r.published && <span className="tag">非公開</span>}
                  <div className="muted small">{r.genre}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(r.start_date, r.end_date)}</td>
                <td>{{ scheduled: '開催予定', canceled: '中止', postponed: '延期' }[r.status]}</td>
                <td>{r.prefecture}</td>
                <td className="num">{r.spots}</td>
                <td className="num"><Link href={`/admin/reports?event=${r.id}`}>{r.reports}</Link></td>
                <td className="num" style={{ color: r.flags ? 'var(--danger)' : 'var(--muted)', fontWeight: r.flags ? 700 : 400 }}>{r.flags}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Link href={`/admin/events/${r.id}`}>編集</Link>{'　'}
                  <Link href={`/events/${r.slug}`} target="_blank">表示 ↗</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reset && <div className="flash">サンプルデータを今日基準の日程で作り直しました</div>}
      <form action={resetSamples} className="admin-foot-note">
        サンプルデータ：<button className="linklike">今日を基準に作り直す</button>（サンプルイベントだけを削除して作り直します。実イベントには影響しません）
      </form>
    </>
  );
}
