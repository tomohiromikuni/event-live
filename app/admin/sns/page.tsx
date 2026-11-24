import Link from 'next/link';
import { q } from '@/lib/db';
import { hashtagsFor } from '@/lib/hashtags';

type Row = { id: number; name: string; prefecture: string; start_date: string; hashtags: string; genre_slug: string;
  clicks: number; visits: number; x: number; line: number; copy: number; live: number };

const CH = [['x', 'X'], ['line', 'LINE'], ['copy', 'URLコピー'], ['native', '端末の共有']] as const;

/**
 * SNS・シェアの集計。
 * 自分で記録できるもの（共有ボタンが押された数・共有リンクからの訪問数）だけを表示する。
 * SNS上の表示回数・いいね数・#イベナウ の投稿数は、各SNSのAPI（有料・制限あり）が必要なので未対応。
 */
export default async function SnsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const since = Date.now() - days * 86400_000;
  const [totals, rows] = await Promise.all([
    q<{ action: string; channel: string; n: number }>(
      'SELECT action, channel, COUNT(*)::int AS n FROM share_events WHERE created_at >= $1 GROUP BY action, channel', [since]),
    q<Row>(`SELECT e.id, e.name, e.prefecture, e.start_date, e.hashtags, g.slug AS genre_slug,
        COUNT(*) FILTER (WHERE s.action = 'click')::int AS clicks,
        COUNT(*) FILTER (WHERE s.action = 'visit')::int AS visits,
        COUNT(*) FILTER (WHERE s.action = 'click' AND s.channel = 'x')::int AS x,
        COUNT(*) FILTER (WHERE s.action = 'click' AND s.channel = 'line')::int AS line,
        COUNT(*) FILTER (WHERE s.action = 'click' AND s.channel = 'copy')::int AS copy,
        COUNT(*) FILTER (WHERE s.context = 'live')::int AS live
      FROM share_events s JOIN events e ON e.id = s.event_id JOIN genres g ON g.id = e.genre_id
      WHERE s.created_at >= $1 GROUP BY e.id, g.slug ORDER BY COUNT(*) DESC LIMIT 100`, [since]),
  ]);
  const sum = (action: string, ch?: string) => totals.filter((t) => t.action === action && (!ch || t.channel === ch)).reduce((a, t) => a + t.n, 0);

  return (
    <>
      <div className="section-head">
        <h2>SNS・シェア（直近{days}日）</h2>
        <span className="small">{[7, 30, 90].map((n) => <Link key={n} href={`/admin/sns?days=${n}`} style={{ marginLeft: 8, fontWeight: n === days ? 800 : 400 }}>{n}日</Link>)}</span>
      </div>
      <p className="muted small">
        ここに出るのは EVENOW 側で記録できる数字だけです（共有ボタンが押された数／共有リンクから来た訪問数）。
        SNS上の表示回数・いいね・<strong>#イベナウ</strong> の投稿数は、各SNSのAPI（有料・取得制限あり）が必要なため、まだ集計していません。
      </p>
      <div className="panel" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 0 }}>
        <div><div className="muted small">共有ボタン</div><div style={{ fontSize: 26, fontWeight: 800 }}>{sum('click')}</div>
          <div className="muted small">{CH.map(([k, l]) => `${l} ${sum('click', k)}`).join('・')}</div></div>
        <div><div className="muted small">共有リンクからの訪問</div><div style={{ fontSize: 26, fontWeight: 800 }}>{sum('visit')}</div>
          <div className="muted small">現地情報の共有経由 {totals.filter((t) => t.action === 'visit' && t.channel.endsWith('_live')).reduce((a, t) => a + t.n, 0)}</div></div>
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead><tr><th>イベント</th><th>共有</th><th>訪問</th><th>内訳（X / LINE / コピー）</th><th>現地情報</th><th>ハッシュタグ</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">まだ記録がありません</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/events/${r.id}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{r.name}</Link></td>
                <td>{r.clicks}</td><td>{r.visits}</td><td>{r.x} / {r.line} / {r.copy}</td><td>{r.live}</td>
                <td className="small">{hashtagsFor({ ...r, genre_slug: r.genre_slug }).join(' ')}{!r.hashtags && <span className="muted">（自動）</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
