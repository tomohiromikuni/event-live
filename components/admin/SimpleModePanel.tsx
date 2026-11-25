'use client';
import { startTransition, useActionState } from 'react';
import { enableSimple } from '@/app/admin/actions';

/** かんたん表示（会場マップなし）の切り替え・説明 */
export default function SimpleModePanel({ eventId, simple, items, hasMap }: { eventId: number; simple: boolean; items: string[]; hasMap: boolean }) {
  const [err, action, pending] = useActionState(enableSimple, null);
  if (simple) {
    return (
      <div className="panel">
        <h2>かんたん表示（会場マップなし）</h2>
        <p className="small" style={{ marginTop: 0 }}>
          地図の代わりに、次の項目で来場者が状況を投稿します：<strong>{items.join('／')}</strong>
        </p>
        <p className="muted small" style={{ marginBottom: 0 }}>
          下の「会場マップ」で施設やエリアを描くと、自動で通常のマップ表示に切り替わります（そのとき、これらの項目と投稿は削除されます）。
          公開するには、開催場所と、公式サイトまたは情報元のURLが必要です。
        </p>
      </div>
    );
  }
  if (hasMap) return null;
  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
      <h2>会場マップがまだありません</h2>
      <p className="small" style={{ marginTop: 0 }}>
        マップを作る時間がないときは「かんたん表示」にすると、地図なしで公開できます。
        駐車場（会場周辺）・トイレ・飲食・屋台などの項目で、来場者がワンタップで状況を投稿できます。
      </p>
      <input type="hidden" name="id" value={eventId} />
      {err && <div className="error-text">{err}</div>}
      <button className="btn sm" disabled={pending}>かんたん表示にする</button>
    </form>
  );
}
