import Link from 'next/link';
import { q } from '@/lib/db';
import { ApproveForm } from '@/components/admin/CollectForms';
import { mergeCandidate, rejectCandidate } from '../collect-actions';
import type { Extracted } from '@/lib/collect/extract';

type Row = { id: number; data: string; source_url: string; confidence: number; status: string; match_event_id: number | null;
  match_name: string | null; match_start: string | null; match_end: string | null; created_at: number; event_id: number | null };

const FIELDS: [keyof Extracted, string][] = [
  ['start_date', '開始日'], ['end_date', '終了日'], ['time_text', '時間'], ['prefecture', '都道府県'], ['city', '市区町村'],
  ['venue_name', '会場'], ['address', '住所'], ['organizer', '主催'], ['official_url', '公式サイト'], ['access', 'アクセス'],
  ['parking_info', '駐車場'], ['shuttle_info', 'シャトルバス'], ['traffic_info', '交通規制'], ['toilet_info', 'トイレ'], ['food_info', '飲食エリア'], ['ticket_info', '料金'], ['summary', '概要'],
];
const STATUS: Record<string, string> = { scheduled: '開催予定', canceled: '中止', postponed: '延期', unknown: '未確認' };

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const rows = await q<Row>(`SELECT c.*, e.name AS match_name, e.start_date AS match_start, e.end_date AS match_end
    FROM event_candidates c LEFT JOIN events e ON e.id = c.match_event_id
    ${all ? '' : "WHERE c.status = 'pending'"} ORDER BY c.status = 'pending' DESC, c.confidence DESC, c.id DESC LIMIT 100`);
  return (
    <>
      <div className="section-head">
        <h1 className="admin-title" style={{ margin: 0 }}>{all ? '候補（すべて）' : '確認が必要な候補'}（{rows.length}件）</h1>
        <Link href={all ? '/admin/candidates' : '/admin/candidates?all=1'}>{all ? '確認待ちだけ表示' : '処理済みも表示'}</Link>
      </div>
      <p className="muted small">
        AIが情報源から抜き出した内容です。<strong>「未確認」の項目は推測で埋めていません。</strong>情報元のページで内容を確かめてから承認してください。
        承認すると<strong>非公開</strong>のイベントができます（会場マップを作ってから公開）。
      </p>
      {rows.length === 0 && <div className="empty">確認待ちの候補はありません</div>}
      {rows.map((r) => {
        const d = JSON.parse(r.data) as Extracted & { map_links?: string[] };
        return (
          <div key={r.id} className="panel cand">
            <div className="cand-head">
              <strong className="cand-name">{d.name}</strong>
              <span className={`cand-conf ${r.confidence >= 80 ? 'hi' : r.confidence >= 55 ? 'mid' : 'lo'}`}>信頼度 {r.confidence}</span>
              <span className="tag">{STATUS[d.status] ?? d.status}</span>
              {r.status !== 'pending' && <span className="tag">{{ approved: '承認済み', rejected: '却下', merged: '既存に反映' }[r.status]}</span>}
            </div>
            <div className="small">情報元：<a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_url}</a></div>
            {r.match_event_id && (
              <div className="cand-match">
                ⚠️ 既存のイベント「<Link href={`/admin/events/${r.match_event_id}`}>{r.match_name}</Link>」（{r.match_start}〜{r.match_end}）と同じ可能性があります
              </div>
            )}
            <table className="cand-table"><tbody>
              {FIELDS.map(([k, label]) => {
                const v = d[k] as string | null;
                return <tr key={k}><th>{label}</th><td>{v ? v : <span className="muted">未確認</span>}</td></tr>;
              })}
              {d.map_links?.length ? <tr><th>マイマップ</th><td>{d.map_links.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{u}</a>)}</td></tr> : null}
            </tbody></table>
            <details className="small"><summary>AIが根拠にした本文</summary>
              <div>名前：{d.evidence?.name ?? '—'}</div><div>日付：{d.evidence?.date ?? '—'}</div><div>場所：{d.evidence?.place ?? '—'}</div>
            </details>
            {r.status === 'pending' ? (
              <div className="cand-actions">
                <ApproveForm id={r.id} name={d.name} start={d.start_date} end={d.end_date} pref={d.prefecture} />
                {r.match_event_id && (
                  <form action={mergeCandidate}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn sm ghost">既存のイベントに反映（日程・開催状況・情報元）</button>
                  </form>
                )}
                <form action={rejectCandidate}><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost">却下</button></form>
              </div>
            ) : r.event_id ? <div className="small"><Link href={`/admin/events/${r.event_id}`}>作成・反映したイベントを開く</Link></div> : null}
          </div>
        );
      })}
    </>
  );
}
