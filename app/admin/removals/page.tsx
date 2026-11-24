import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { q } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

type Row = {
  id: number; event_id: number | null; event_name: string; reason: string; relation: string; message: string;
  name: string; email: string; mail_sent: number; status: string; resolution: string; resolved_at: number | null; created_at: number;
  slug: string | null; published: number | null; same_event: number;
};

const TABS = [
  { key: 'new', label: '未対応' },
  { key: 'done', label: '対応済み' },
  { key: 'all', label: 'すべて' },
] as const;

const RESOLUTION_LABEL: Record<string, string> = { unpublished: '掲載を停止した', kept: '掲載を続けた' };

/**
 * 対応する。同じイベントへの未対応の依頼は、まとめて同じ対応にする。
 * unpublish: イベントを非公開にして対応済み（データは残るので、編集画面からいつでも公開に戻せる）
 * keep: 掲載は続けたまま対応済み（内容を確認し、停止しないと判断した場合）
 * reopen: 未対応に戻す（イベントの公開状態は変えない）
 */
async function resolve(f: FormData, action: 'unpublish' | 'keep' | 'reopen') {
  await requireAdmin();
  const id = Number(f.get('id'));
  const [row] = await q<{ event_id: number | null }>(`SELECT event_id FROM inquiries WHERE id = $1 AND kind = 'removal'`, [id]);
  if (!row) return;
  const now = Date.now();
  if (action === 'reopen') {
    await q(`UPDATE inquiries SET status = 'new', resolution = '', resolved_at = NULL WHERE id = $1`, [id]);
  } else {
    const resolution = action === 'unpublish' ? 'unpublished' : 'kept';
    if (action === 'unpublish' && row.event_id) {
      await q('UPDATE events SET published = 0, updated_at = $2 WHERE id = $1', [row.event_id, now]);
    }
    if (row.event_id) {
      await q(`UPDATE inquiries SET status = 'done', resolution = $2, resolved_at = $3
        WHERE kind = 'removal' AND (id = $1 OR (event_id = $4 AND status = 'new'))`, [id, resolution, now, row.event_id]);
    } else {
      await q(`UPDATE inquiries SET status = 'done', resolution = $2, resolved_at = $3 WHERE id = $1`, [id, resolution, now]);
    }
  }
  revalidatePath('/', 'layout');
}
// ボタンごとに別の処理を割り当てる（押したボタンの種類を確実に受け取るため）
async function unpublishAction(f: FormData) { 'use server'; await resolve(f, 'unpublish'); }
async function keepAction(f: FormData) { 'use server'; await resolve(f, 'keep'); }
async function reopenAction(f: FormData) { 'use server'; await resolve(f, 'reopen'); }

export default async function Removals({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.t) ?? TABS[0];
  const where = tab.key === 'all' ? '' : `AND i.status = '${tab.key}'`;
  const rows = await q<Row>(`SELECT i.*, e.slug, e.published,
      (SELECT COUNT(*)::int FROM inquiries j WHERE j.kind = 'removal' AND j.event_id = i.event_id) AS same_event
    FROM inquiries i LEFT JOIN events e ON e.id = i.event_id
    WHERE i.kind = 'removal' ${where} ORDER BY i.created_at DESC LIMIT 200`);
  const fmt = (ms: number) => new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="admin-head">
        <h1>削除依頼 <span className="muted">{rows.length}件</span></h1>
        <nav className="seg" aria-label="表示する依頼">
          {TABS.map((x) => (
            <Link key={x.key} href={x.key === 'new' ? '/admin/removals' : `/admin/removals?t=${x.key}`} className={x.key === tab.key ? 'on' : undefined}
              aria-current={x.key === tab.key ? 'true' : undefined}>{x.label}</Link>
          ))}
        </nav>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        イベントページの「掲載停止を申請する」から届いた依頼です。「掲載を停止」するとイベントは非公開になります（データは残り、編集画面からいつでも公開に戻せます）。
        同じイベントへの未対応の依頼は、まとめて同じ対応になります。
      </p>

      {rows.length === 0 ? (
        <div className="empty">{tab.key === 'new' ? '未対応の削除依頼はありません' : '該当する依頼はありません'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.id} className="panel removal" style={{ marginTop: 0 }}>
              <div className="removal-head">
                <span className="muted small">#{r.id}・{fmt(Number(r.created_at))}</span>
                {r.status === 'done'
                  ? <span className="tag">{RESOLUTION_LABEL[r.resolution] ?? '対応済み'}{r.resolved_at ? `（${fmt(Number(r.resolved_at))}）` : ''}</span>
                  : <span className="tag danger">未対応</span>}
                {r.same_event > 1 && <span className="tag">このイベントへの依頼 {r.same_event}件</span>}
                {!r.mail_sent && <span className="muted small">メール未送信</span>}
              </div>

              <div className="removal-event">
                {r.event_id ? (
                  <>
                    <Link href={`/admin/events/${r.event_id}`} className="admin-name">{r.event_name}</Link>
                    <span className={`tag ${r.published ? 'ok' : ''}`}>{r.published ? '公開中' : '非公開'}</span>
                    {r.slug && r.published ? <Link href={`/events/${r.slug}`} target="_blank" className="small">公開ページ ↗</Link> : null}
                  </>
                ) : <span className="admin-name">{r.event_name || '（イベントが削除済み）'}</span>}
              </div>

              <dl className="removal-body">
                <dt>理由</dt><dd>{r.reason || '—'}</dd>
                <dt>ご関係</dt><dd>{r.relation || '—'}</dd>
                {r.message && <><dt>内容</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.message}</dd></>}
                <dt>連絡先</dt><dd>{r.name || '（お名前なし）'}・<a href={`mailto:${r.email}`}>{r.email}</a></dd>
              </dl>

              <form action={keepAction} className="removal-actions">
                <input type="hidden" name="id" value={r.id} />
                {r.status === 'done' ? (
                  <button className="btn ghost sm" formAction={reopenAction}>未対応に戻す</button>
                ) : (
                  <>
                    {r.event_id && r.published
                      ? <button className="btn sm" formAction={unpublishAction}>掲載を停止して対応済みにする</button>
                      : null}
                    <button className="btn ghost sm" formAction={keepAction}>{r.event_id && r.published ? '掲載を続けて対応済みにする' : '対応済みにする'}</button>
                  </>
                )}
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
