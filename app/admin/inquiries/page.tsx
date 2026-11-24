import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { q } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { KIND_LABEL } from '@/lib/inquiry';

type Row = { id: number; kind: string; event_id: number | null; event_name: string; reason: string; relation: string; message: string;
  name: string; email: string; mail_sent: number; status: string; created_at: number };

async function setStatus(f: FormData) {
  'use server';
  await requireAdmin();
  await q('UPDATE inquiries SET status = $1 WHERE id = $2', [f.get('status') === 'done' ? 'done' : 'new', Number(f.get('id'))]);
  revalidatePath('/admin/inquiries');
}

export default async function Inquiries({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const rows = await q<Row>(`SELECT * FROM inquiries ${all ? '' : "WHERE status = 'new'"} ORDER BY created_at DESC LIMIT 200`);
  const mailOn = !!(process.env.CONTACT_EMAIL && process.env.RESEND_API_KEY);
  return (
    <>
      <div className="section-head">
        <h2>{all ? '問い合わせ・掲載停止の申請（すべて）' : '未対応の問い合わせ・掲載停止の申請'}（{rows.length}件）</h2>
        <Link href={all ? '/admin/inquiries' : '/admin/inquiries?all=1'}>{all ? '未対応だけ表示' : 'すべて表示'}</Link>
      </div>
      <p className="muted small">
        {mailOn ? '新しい申請・問い合わせは、設定したメールアドレスにも通知されます。'
          : '⚠️ メール通知が未設定です（環境変数 CONTACT_EMAIL と RESEND_API_KEY）。届いた内容はこの画面で確認できます。'}
        掲載停止の申請は、内容を確認したうえでイベント編集画面の「公開する」を外すか、イベントを削除して対応してください。
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.length === 0 && <div className="empty">未対応のものはありません</div>}
        {rows.map((r) => (
          <div key={r.id} className="panel" style={{ marginTop: 0, opacity: r.status === 'done' ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <span className={`badge ${r.kind === 'removal' ? 'canceled' : ''}`} style={r.kind === 'removal' ? undefined : { background: '#e2e8f0' }}>{KIND_LABEL[r.kind]}</span>
              <span className="muted small">#{r.id}・{new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
              {!r.mail_sent && <span className="muted small">（メール未送信）</span>}
            </div>
            {r.event_name && (
              <div style={{ fontWeight: 700 }}>
                {r.event_id ? <Link href={`/admin/events/${r.event_id}`} style={{ color: 'var(--brand)' }}>{r.event_name}</Link> : r.event_name}
              </div>
            )}
            <div className="small"><strong>{r.kind === 'removal' ? '理由' : '種類'}：</strong>{r.reason}{r.relation && `　／　ご関係：${r.relation}`}</div>
            {r.message && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0', fontSize: 14 }}>{r.message}</p>}
            <div className="small muted">{r.name || '（お名前なし）'}・<a href={`mailto:${r.email}`} style={{ textDecoration: 'underline' }}>{r.email}</a></div>
            <form action={setStatus} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value={r.status === 'done' ? 'new' : 'done'} />
              {r.status === 'done'
                ? <button className="btn ghost sm">未対応に戻す</button>
                : <button className="btn sm">対応済みにする</button>}
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
