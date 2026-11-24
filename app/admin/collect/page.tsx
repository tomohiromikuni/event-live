import Link from 'next/link';
import { one, q } from '@/lib/db';
import { getSetting } from '@/lib/collect/run';
import { runCollectNow, setCollectEnabled } from '../collect-actions';

type Run = { id: number; trigger: string; started_at: number; finished_at: number; fetched: number; changed: number; extracted: number;
  new_candidates: number; duplicates: number; errors: number; input_tokens: number; output_tokens: number; log: string };

const fmt = (t: number) => new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ ran?: string }> }) {
  const { ran } = await searchParams;
  const [enabled, runs, counts] = await Promise.all([
    getSetting('collect_enabled', '0'),
    q<Run>('SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 20'),
    one<{ sources: number; active: number; pending_pages: number; failed_pages: number; candidates: number }>(`SELECT
      (SELECT COUNT(*)::int FROM sources) AS sources,
      (SELECT COUNT(*)::int FROM sources WHERE enabled = 1 AND terms_checked_at <> '') AS active,
      (SELECT COUNT(*)::int FROM crawl_pages WHERE status = 'pending') AS pending_pages,
      (SELECT COUNT(*)::int FROM crawl_pages WHERE status = 'failed') AS failed_pages,
      (SELECT COUNT(*)::int FROM event_candidates WHERE status = 'pending') AS candidates`),
  ]);
  const keyOk = !!process.env.ANTHROPIC_API_KEY;
  const model = process.env.COLLECT_MODEL || 'claude-opus-5-5';
  const last = runs[0];
  const month = runs.filter((r) => r.started_at > Date.now() - 30 * 86400_000);
  return (
    <>
      <h1 className="admin-title">自動収集</h1>
      {ran && <div className="flash">収集を1回実行しました（結果は下の履歴）</div>}
      <div className="panel">
        <div className="collect-status">
          <div><span>自動収集（毎日）</span><strong>{enabled === '1' ? 'ON' : 'OFF'}</strong>
            <form action={setCollectEnabled}><input type="hidden" name="on" value={enabled === '1' ? '0' : '1'} /><button className="linklike small">{enabled === '1' ? 'OFFにする' : 'ONにする'}</button></form></div>
          <div><span>最終実行</span><strong>{last ? fmt(last.started_at) : '—'}</strong></div>
          <div><span>巡回中の情報源</span><strong>{counts?.active ?? 0} / {counts?.sources ?? 0}</strong><Link href="/admin/sources" className="small">情報源を管理</Link></div>
          <div><span>確認待ちの候補</span><strong>{counts?.candidates ?? 0}</strong><Link href="/admin/candidates" className="small">候補を確認</Link></div>
          <div><span>AI整理待ちのページ</span><strong>{counts?.pending_pages ?? 0}</strong>{counts?.failed_pages ? <span className="small muted">失敗 {counts.failed_pages}</span> : null}</div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          AI：{keyOk ? `設定済み（${model}）` : '⚠️ ANTHROPIC_API_KEY が未設定のため、ページの取得だけ行い、AIでの整理はしません'}
          ／ 直近30日のAI利用：入力 {month.reduce((a, r) => a + r.input_tokens, 0).toLocaleString()}・出力 {month.reduce((a, r) => a + r.output_tokens, 0).toLocaleString()} トークン
        </p>
        <form action={runCollectNow} style={{ marginTop: 10 }}><button className="btn sm">今すぐ1回実行</button></form>
      </div>
      <h2 className="admin-subtitle">実行履歴</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>日時</th><th>種類</th><th>取得</th><th>変更あり</th><th>AI整理</th><th>新規候補</th><th>重複</th><th>エラー</th></tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={8} className="muted">まだ実行していません</td></tr>}
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.started_at)}</td><td>{r.trigger === 'cron' ? '定期' : '手動'}</td><td>{r.fetched}</td><td>{r.changed}</td><td>{r.extracted}</td>
                <td>{r.new_candidates}</td><td>{r.duplicates}</td><td style={{ color: r.errors ? 'var(--danger)' : undefined }}>{r.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {last?.log && <details className="panel small"><summary>最新の実行ログ</summary><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{last.log}</pre></details>}
    </>
  );
}
