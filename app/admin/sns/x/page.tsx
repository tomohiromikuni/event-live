import Link from 'next/link';
import { q } from '@/lib/db';
import { xReady } from '@/lib/sns/x';
import { KIND_LABEL, type SnsKind } from '@/lib/sns/compose';
import { snsSettings } from '@/lib/sns/settings';
import { todayJST } from '@/lib/dates';
import { GenerateButton, SnsDraft } from '@/components/admin/SnsDraft';
import { saveSnsSettings } from '../../sns-actions';

export const dynamic = 'force-dynamic';

type Row = { id: number; event_id: number; name: string; kind: SnsKind; text: string; status: string; error: string; external_url: string;
  posted_at: number; created_at: number; updated_at: number };

const STATUS: Record<string, string> = { draft: '下書き', posted: '投稿済み', failed: '失敗', canceled: '取り消し' };
const time = (ms: number) => (ms ? new Date(Number(ms)).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * X 投稿（第1段階：下書きの自動作成 → 確認・修正 → 手動で投稿）。
 * 自動での投稿はまだ行わない（文面と費用を確かめてから、第2段階で有効にする）。
 */
export default async function SnsXPage() {
  const ready = xReady();
  const s = await snsSettings();
  const dayStart = Date.parse(`${todayJST()}T00:00:00+09:00`);
  const [pending, history, [{ today }]] = await Promise.all([
    q<Row>(`SELECT p.*, e.name FROM sns_posts p JOIN events e ON e.id = p.event_id WHERE p.status IN ('draft', 'failed') ORDER BY p.created_at DESC LIMIT 50`),
    q<Row>(`SELECT p.*, e.name FROM sns_posts p JOIN events e ON e.id = p.event_id WHERE p.status IN ('posted', 'canceled') ORDER BY p.updated_at DESC LIMIT 50`),
    q<{ today: number }>("SELECT COUNT(*)::int AS today FROM sns_posts WHERE status = 'posted' AND posted_at >= $1", [dayStart]),
  ]);

  return (
    <>
      <div className="section-head">
        <h1 className="admin-title" style={{ margin: 0 }}>X 投稿</h1>
        <Link href="/admin/sns">共有の集計へ</Link>
      </div>
      <p className="muted small">
        下書きは15分ごとに自動で作られます（「いまの状況から下書きを作る」でも作れます）。<strong>自動投稿は下の設定でONにしたときだけ</strong>行います（初期はOFF）。投稿文は決まった型で作り、実際のデータ以外は入りません。
        URL付きの投稿は X API の利用料金が1件 約$0.20 かかります。
      </p>
      {!ready && (
        <div className="cand-match">
          X の認証情報が未設定のため、投稿はできません（下書きの作成・確認はできます）。X Developer Portal でアプリ（権限：Read and Write）を作り、
          Vercel の環境変数に <code>X_API_KEY</code>・<code>X_API_SECRET</code>・<code>X_ACCESS_TOKEN</code>・<code>X_ACCESS_SECRET</code> を設定して再デプロイしてください。
        </div>
      )}

      <div className="panel">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>投稿待ち（{pending.length}件）</h2>
          <GenerateButton />
        </div>
        <p className="muted small">今日の投稿 {today} / {s.dailyMax} 件・前日案内／当日案内／現地の投稿（直近30分に{s.liveMinUsers}人以上）／中止・延期 が対象です。</p>
        {pending.length === 0 && <div className="empty">投稿待ちの下書きはありません</div>}
        {pending.map((p) => (
          <div key={p.id} style={{ borderTop: '1.5px solid var(--border)', padding: '10px 0' }}>
            <div className="small" style={{ marginBottom: 4 }}>
              <span className="tag">{KIND_LABEL[p.kind] ?? p.kind}</span>{' '}
              <Link href={`/admin/events/${p.event_id}`}>{p.name}</Link>
              <span className="muted">　作成 {time(p.created_at)}{p.status === 'failed' ? '・失敗' : ''}</span>
            </div>
            <SnsDraft id={p.id} text={p.text} failed={p.status === 'failed' ? p.error : undefined} ready={ready} />
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>履歴（直近50件）</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>日時</th><th>種類</th><th>イベント</th><th>結果</th><th>本文</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={5} className="muted">まだありません</td></tr>}
              {history.map((p) => (
                <tr key={p.id}>
                  <td className="small">{time(p.posted_at || p.updated_at)}</td>
                  <td className="small">{KIND_LABEL[p.kind] ?? p.kind}</td>
                  <td className="small"><Link href={`/admin/events/${p.event_id}`}>{p.name}</Link></td>
                  <td className="small">
                    {p.external_url ? <a href={p.external_url} target="_blank" rel="noopener noreferrer">{STATUS[p.status]} ↗</a> : STATUS[p.status]}
                    {p.error && <div className="muted">{p.error}</div>}
                  </td>
                  <td className="small" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{p.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>設定</h2>
        <form action={saveSnsSettings} className="form-grid">
          <label className="small">1日の最大投稿数 <input className="input" type="number" name="daily_max" min={1} max={50} defaultValue={s.dailyMax} /></label>
          <label className="small">投稿の最低間隔（分） <input className="input" type="number" name="min_interval_min" min={0} max={720} defaultValue={s.minIntervalMin} /></label>
          <label className="small">現地の投稿：直近30分に何人以上から <input className="input" type="number" name="live_min_users" min={2} max={20} defaultValue={s.liveMinUsers} /></label>
          <label className="small">現地の投稿：同じイベントの間隔（分） <input className="input" type="number" name="live_gap_min" min={30} max={720} defaultValue={s.liveGapMin} /></label>
          <fieldset className="small" style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
            <legend style={{ fontWeight: 800 }}>自動投稿（15分ごとの定期実行）</legend>
            <label><input type="checkbox" name="auto_post" defaultChecked={s.autoPost} /> 自動で投稿する（OFFなら下書きを作るだけ）</label>
            <div style={{ marginTop: 6 }}>
              {([['pre', '前日案内（17〜22時）'], ['today', '当日案内（7〜20時）'], ['live', '現地の投稿（8〜23時）']] as const).map(([k, l]) => (
                <label key={k} style={{ marginRight: 12 }}><input type="checkbox" name="auto_kinds" value={k} defaultChecked={s.autoKinds.includes(k)} /> {l}</label>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>1回の実行で投稿するのは1件まで。1日の上限・最低間隔も守ります。中止・延期は常に手動です。</div>
          </fieldset>
          <div><button className="btn sm">設定を保存</button></div>
        </form>
      </div>
    </>
  );
}
