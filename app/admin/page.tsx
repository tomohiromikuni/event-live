import Link from 'next/link';
import { db } from '@/lib/db';
import { fmtRange } from '@/lib/dates';

type Row = { id: number; slug: string; name: string; start_date: string; end_date: string; prefecture: string; status: string;
  is_sample: number; published: number; genre: string; spots: number; reports: number; flags: number };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = db().prepare(`SELECT e.id, e.slug, e.name, e.start_date, e.end_date, e.prefecture, e.status, e.is_sample, e.published,
      g.name AS genre,
      (SELECT COUNT(*) FROM spots s WHERE s.event_id = e.id) AS spots,
      (SELECT COUNT(*) FROM reports r WHERE r.event_id = e.id) AS reports,
      (SELECT COUNT(*) FROM report_flags f JOIN reports r ON r.id = f.report_id WHERE r.event_id = e.id AND f.resolved = 0) AS flags
    FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.name LIKE ? ORDER BY e.start_date DESC LIMIT 200`).all(`%${q ?? ''}%`) as Row[];
  return (
    <>
      <div className="section-head"><h2>イベント一覧（{rows.length}件）</h2><Link href="/admin/events/new">＋ 新規登録</Link></div>
      <form style={{ marginBottom: 10 }}><input className="input" name="q" defaultValue={q} placeholder="イベント名で絞り込み" /></form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>イベント</th><th>開催日</th><th>状態</th><th>地点</th><th>投稿</th><th>未対応通報</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/events/${r.id}`} style={{ fontWeight: 700, color: 'var(--brand)' }}>{r.name}</Link><br />
                  <span className="muted">{r.genre}・{r.prefecture}</span>
                  {r.is_sample ? <span className="badge sample" style={{ marginLeft: 4 }}>サンプル</span> : null}
                  {!r.published && <span className="badge" style={{ marginLeft: 4, background: '#e2e8f0' }}>非公開</span>}
                  <br /><Link href={`/events/${r.slug}`} className="muted small" target="_blank">公開ページ ↗</Link>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(r.start_date, r.end_date)}</td>
                <td>{{ scheduled: '開催予定', canceled: '中止', postponed: '延期' }[r.status]}</td>
                <td>{r.spots}</td>
                <td><Link href={`/admin/reports?event=${r.id}`} style={{ textDecoration: 'underline' }}>{r.reports}</Link></td>
                <td style={{ color: r.flags ? 'var(--danger)' : undefined, fontWeight: r.flags ? 700 : 400 }}>{r.flags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
