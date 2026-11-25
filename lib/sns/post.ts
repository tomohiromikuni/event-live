import 'server-only';
import { one, q } from '../db';
import { addDays, todayJST } from '../dates';
import { X_LIMIT, xLength } from '../share';
import { postToX } from './x';
import { snsSettings } from './settings';

type Row = { id: number; kind: string; text: string; status: string; snapshot: string; start_date: string; end_date: string; ev_status: string; published: number };

/**
 * 下書きを X に投稿する（手動・自動の共通）。投稿の直前に、内容がいまも正しいか・上限を超えないかを確かめる。
 * 古くなった下書き（前日を過ぎた・開催日でない・中止・現地の投稿から1時間以上）は取り消す。成功なら null、だめなら理由。
 */
export async function tryPost(id: number): Promise<string | null> {
  const p = await one<Row>(`SELECT p.id, p.kind, p.text, p.status, p.snapshot, e.start_date, e.end_date, e.status AS ev_status, e.published
    FROM sns_posts p JOIN events e ON e.id = p.event_id WHERE p.id = $1`, [id]);
  if (!p || !['draft', 'failed'].includes(p.status)) return 'この下書きはすでに処理されています';
  const today = todayJST();
  const stale = async (why: string) => {
    await q("UPDATE sns_posts SET status = 'canceled', error = $1, updated_at = $2 WHERE id = $3", [why, Date.now(), id]);
    return `${why}（下書きは取り消しました）`;
  };
  // 古くなった内容は投稿しない
  if (!p.published) return stale('イベントが非公開になっています');
  if (p.kind === 'pre' && addDays(today, 1) !== p.start_date) return stale('前日案内の日を過ぎました');
  if (p.kind === 'today' && !(p.start_date <= today && today <= p.end_date)) return stale('開催日ではなくなりました');
  if ((p.kind === 'pre' || p.kind === 'today') && p.ev_status !== 'scheduled') return stale('開催状況が変わりました（中止・延期）');
  if (p.kind === 'live') {
    const snap = JSON.parse(p.snapshot || '{}') as { newest?: number };
    if (!snap.newest || Date.now() - snap.newest > 60 * 60_000) return stale('現地の投稿から1時間以上たち、情報が古くなりました');
  }
  if (xLength(p.text) > X_LIMIT) return `長すぎます（${xLength(p.text)} / ${X_LIMIT}）`;
  // 投稿頻度（1日の上限・最低間隔）
  const s = await snsSettings();
  const dayStart = Date.parse(`${today}T00:00:00+09:00`);
  const [{ n, last }] = await q<{ n: number; last: number | null }>(
    "SELECT COUNT(*) FILTER (WHERE posted_at >= $1)::int AS n, MAX(posted_at) AS last FROM sns_posts WHERE status = 'posted'", [dayStart]);
  if (n >= s.dailyMax) return `今日の投稿数が上限（${s.dailyMax}件）に達しています。設定で変更できます`;
  if (last && s.minIntervalMin && Date.now() - Number(last) < s.minIntervalMin * 60_000) {
    return `前の投稿から${s.minIntervalMin}分たっていません（あと${Math.ceil((s.minIntervalMin * 60_000 - (Date.now() - Number(last))) / 60_000)}分）`;
  }
  try {
    const r = await postToX(p.text);
    await q("UPDATE sns_posts SET status = 'posted', external_id = $1, external_url = $2, error = '', attempts = attempts + 1, posted_at = $3, updated_at = $3 WHERE id = $4",
      [r.id, r.url, Date.now(), id]);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q("UPDATE sns_posts SET status = 'failed', error = $1, attempts = attempts + 1, updated_at = $2 WHERE id = $3", [msg.slice(0, 300), Date.now(), id]);
    return msg;
  }
}
