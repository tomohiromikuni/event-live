import Link from 'next/link';
import { one, q } from '@/lib/db';
import { getSetting } from '@/lib/collect/run';
import { collectModel } from '@/lib/collect/extract';
import { runCollectNow, runDiscoverNow, runSweepNow, saveDiscoverSettings, setAutoPublish, setCollectEnabled } from '../collect-actions';
import { sweepStatus } from '@/lib/collect/sweep';
import { discoverSettings, nextTarget, seasonThemes } from '@/lib/collect/discover';
import { PREFECTURES } from '@/lib/prefectures';
import { autoMapBatch } from '../actions';

// 地図の自動作成（外部の地図データ・AIの読み取り）を含むため、1回の処理時間の上限を長めにする
export const maxDuration = 60;

type Run = { id: number; trigger: string; started_at: number; finished_at: number; fetched: number; changed: number; extracted: number;
  new_candidates: number; duplicates: number; errors: number; input_tokens: number; output_tokens: number; log: string };

const fmt = (t: number) => new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ ran?: string; automap?: string; discovered?: string }> }) {
  const { ran, automap, discovered } = await searchParams;
  const ds = await discoverSettings();
  const autoPub = (await getSetting('auto_publish', '1')) === '1';
  const sw = await sweepStatus();
  const next = await nextTarget();
  const dlog = JSON.parse(await getSetting('discover_log', '[]')) as { at: number; message: string }[];
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
  const model = collectModel();
  const last = runs[0];
  const month = runs.filter((r) => r.started_at > Date.now() - 30 * 86400_000);
  return (
    <>
      <h1 className="admin-title">自動収集</h1>
      {ran && <div className="flash">収集を1回実行しました（結果は下の履歴）</div>}
      {automap && <div className="flash" style={{ whiteSpace: 'pre-wrap' }}>🗺️ {automap}</div>}
      {discovered && <div className="flash">🔎 {discovered}</div>}
      <div className="panel">
        <h2>自動公開：{autoPub ? 'ON' : 'OFF'}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          ONのとき、集めたイベントは<strong>承認を待たずに公開</strong>し、会場マップも定期実行で自動作成します（非公式サイトのため）。
          ただし「開催日とその根拠の文」「今日以降の開催」「都道府県」「会場か住所」がそろい、既存のイベントと重複しないものだけ。満たさないものは「収集した候補」に残ります。
          間違いに気づいたら、イベント編集で「公開する」を外せばすぐ非公開になります。
        </p>
        <form action={setAutoPublish}><input type="hidden" name="on" value={autoPub ? '0' : '1'} /><button className="btn sm ghost">{autoPub ? '自動公開をOFFにする' : '自動公開をONにする'}</button></form>
      </div>
      <div className="panel">
        <h2>AIで探す（情報源の登録は不要）</h2>
        <div className="small" style={{ margin: '0 0 8px', padding: '8px 10px', background: '#f6f3ff', borderRadius: 10 }}>
          <strong>まとめ探し（月1回・自動）</strong>：対象の都道府県 × 季節のテーマを全部まとめて検索します（{ds.prefs.length * 2}通り・見積もり約{ds.prefs.length * 2 * 5}円）。
          毎月はじめの定期実行で送り、翌日までに結果を受け取って読み込みます。<br />
          今月：{sw.month === new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7) ? (sw.pending ? '送信済み・結果待ち' : '済み') : '未送信（次の定期実行で送ります）'}
          ・取得待ち {sw.new}件・読み込み済み {sw.queued}件
          ・<strong>今月の使用額 約{Math.round(sw.spend)}円 ／ 上限 {ds.budgetYen}円</strong>
          <form action={runSweepNow} style={{ marginTop: 6 }}><button className="btn sm ghost">まとめ探しを今すぐ送る</button></form>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          毎日の自動収集の前に、季節に合わせて「都道府県 × テーマ」（いまの季節は {seasonThemes(new Date(Date.parse(next.from) + 30 * 86400_000).getUTCMonth() + 1).join('・')}）でAIがWeb検索し、
          イベントの<strong>公式サイト</strong>（主催者・自治体・観光協会）を見つけて読み込みます。まとめサイト・ポータル・SNSは使いません。
          見つかったイベントは「収集した候補」に入ります（確認して承認）。費用の目安：1回 約5円（検索3回＋AI）。上限を超えそうなときは自動で止まります。
        </p>
        <div className="small">次に探す：<strong>{next.pref}の「{next.theme}」</strong>（{next.index + 1} / {next.total}）・{next.from}〜{next.to} に開催</div>
        <form action={saveDiscoverSettings} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'end', margin: '10px 0' }}>
          <label className="small">毎日の追加分（回／日・0で停止）<br /><input className="input" type="number" name="per_day" min={0} max={20} defaultValue={ds.perDay} style={{ width: 90 }} /></label>
          <label className="small">月の上限（円）<br /><input className="input" type="number" name="budget_yen" min={0} max={100000} defaultValue={ds.budgetYen} style={{ width: 110 }} /></label>
          <label className="small" style={{ flex: 1, minWidth: 220 }}>対象の都道府県（空欄＝全国。例：千葉県, 東京都）<br />
            <input className="input" name="prefs" defaultValue={ds.prefs.length === PREFECTURES.length ? '' : ds.prefs.join(', ')} style={{ width: '100%' }} /></label>
          <button className="btn sm ghost">保存</button>
        </form>
        <form action={runDiscoverNow}><button className="btn sm ghost">今すぐ1回だけ探す（次の組み合わせ）</button></form>
        {dlog.length > 0 && (
          <details className="small" style={{ marginTop: 8 }} open><summary>最近の結果</summary>
            {dlog.slice(0, 10).map((l) => <div key={l.at}>{new Date(l.at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}　{l.message}</div>)}
          </details>
        )}
      </div>
      <div className="panel">
        <h2>会場マップの自動作成</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          まだ地図の無い（カードだけの）開催前・開催中のイベントに、会場マップを自動で作ります（1回1件・押すたびに次のイベントへ。毎日の自動収集のあとにも自動で実行）。
          ① 会場周辺の常設トイレ・駐車場（OpenStreetMap）② 公式ページのガイドマップから仮設のものを「目安」で追加。人が位置を合わせる作業はありません。<strong>毎日自動で実行</strong>されます（自動収集のON/OFFに関係なく）。
        </p>
        <form action={autoMapBatch}><button className="btn sm">地図の無いイベントに作成（1件）</button></form>
      </div>
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
        <form action={runCollectNow} style={{ marginTop: 10 }}><button className="btn sm">今すぐ1回実行（AI整理待ちのページを読んで候補・自動公開）</button></form>
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
