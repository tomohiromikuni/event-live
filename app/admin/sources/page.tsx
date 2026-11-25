import { q } from '@/lib/db';
import { SourceForm } from '@/components/admin/CollectForms';
import { deleteSource } from '../collect-actions';

type Source = { id: number; name: string; kind: string; url: string; prefecture: string; trust: string; terms_checked_at: string; enabled: number;
  interval_hours: number; note: string; last_fetched_at: number; last_status: string; pages: number; cands: number };

const TRUST: Record<string, string> = { official: '公式', public: '自治体・観光協会', other: 'その他' };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ url?: string; name?: string; pref?: string; trust?: string }> }) {
  const pf = await searchParams;
  const rows = await q<Source>(`SELECT s.*, (SELECT COUNT(*)::int FROM crawl_pages p WHERE p.source_id = s.id) AS pages,
      (SELECT COUNT(*)::int FROM event_candidates c WHERE c.source_id = s.id) AS cands FROM sources s ORDER BY s.id DESC`);
  return (
    <>
      <h1 className="admin-title">情報源</h1>
      <p className="muted small">
        巡回するのは<strong>利用規約を確認し、確認日を入れて「巡回する」にしたもの</strong>だけです。robots.txt で禁止されたページは自動で取得しません。
        規約で「自動での取得・転載の禁止」とあるサイトは登録しないでください。RSS がある場合は RSS を登録すると効率的です。
      </p>
      <div className="panel" id="add"><h2>情報源を追加</h2>
        {pf.url && <p className="small" style={{ marginTop: 0 }}>イベントの公式サイトを入れてあります。<strong>そのサイトの利用規約を確認してから</strong>、確認日を入れて「巡回する」にしてください。</p>}
        <SourceForm prefill={{ url: pf.url, name: pf.name, prefecture: pf.pref, trust: pf.trust }} /></div>
      {rows.length === 0 ? <div className="empty">まだ情報源がありません</div> : rows.map((s) => (
        <div key={s.id} className="panel">
          <div className="small muted" style={{ marginBottom: 6 }}>
            {s.enabled ? '● 巡回中' : '○ 停止中'}・{s.kind === 'rss' ? 'RSS' : 'ページ'}・{TRUST[s.trust]}・取得ページ {s.pages}・候補 {s.cands}
            {s.last_fetched_at ? `・最終取得 ${new Date(s.last_fetched_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（${s.last_status}）` : '・未取得'}
          </div>
          <SourceForm s={s} />
          <form action={deleteSource} style={{ marginTop: 6 }}>
            <input type="hidden" name="id" value={s.id} />
            <button className="linklike small">この情報源を削除</button>
          </form>
        </div>
      ))}
    </>
  );
}
