import Link from 'next/link';
import { q, type Param } from '@/lib/db';
import { moderateReport } from '../actions';

type Row = { id: number; label: string; level: number; created_at: number; hidden: number; flag_count: number; client_id: string;
  spot: string; event: string; event_id: number; open_flags: number; reasons: string | null };

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ event?: string; flagged?: string }> }) {
  const sp = await searchParams;
  const where = ['1 = 1'];
  const args: Param[] = [];
  if (sp.event && /^\d+$/.test(sp.event)) { args.push(Number(sp.event)); where.push(`r.event_id = $${args.length}`); }
  if (sp.flagged) where.push('EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.resolved = 0)');
  const rows = await q<Row>(`SELECT r.id, r.label, r.level, r.created_at, r.hidden, r.flag_count, r.client_id, s.name AS spot, e.name AS event, e.id AS event_id,
      (SELECT COUNT(*)::int FROM report_flags f WHERE f.report_id = r.id AND f.resolved = 0) AS open_flags,
      (SELECT string_agg(NULLIF(f.reason, ''), ' / ') FROM report_flags f WHERE f.report_id = r.id) AS reasons
    FROM reports r JOIN spots s ON s.id = r.spot_id JOIN events e ON e.id = r.event_id
    WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT 300`, args);

  return (
    <>
      <div className="section-head">
        <h2>{sp.flagged ? '通報された投稿' : '投稿一覧'}（{rows.length}件）</h2>
        {(sp.event || sp.flagged) && <Link href="/admin/reports">すべて表示</Link>}
      </div>
      <p className="muted small">通報が3件に達した投稿は自動で非表示になります。投稿者はブラウザ単位の匿名IDで表示しています。</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>投稿時刻</th><th>イベント／地点</th><th>内容</th><th>投稿者ID</th><th>通報</th><th>操作</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">該当する投稿はありません</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.hidden ? 0.5 : 1 }}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                <td><Link href={`/admin/reports?event=${r.event_id}`}>{r.event}</Link><br /><span className="muted">{r.spot}</span></td>
                <td><strong>{r.label}</strong>{r.hidden ? <span className="badge" style={{ background: '#e2e8f0', marginLeft: 4 }}>非表示</span> : null}</td>
                <td><Link href={`/admin/reports?event=${r.event_id}`} className="muted" title={r.client_id}>{r.client_id.slice(0, 8)}</Link></td>
                <td style={{ color: r.open_flags ? 'var(--danger)' : undefined }}>{r.flag_count}{r.open_flags ? `（未対応${r.open_flags}）` : ''}{r.reasons && <><br /><span className="small">{r.reasons}</span></>}</td>
                <td>
                  <form action={moderateReport} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="hidden" name="id" value={r.id} />
                    {r.hidden
                      ? <button className="btn ghost sm" name="op" value="show">再表示</button>
                      : <button className="btn ghost sm" name="op" value="hide">非表示</button>}
                    {r.open_flags > 0 && <button className="btn ghost sm" name="op" value="resolve">問題なし</button>}
                    <button className="btn danger sm" name="op" value="delete">削除</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
