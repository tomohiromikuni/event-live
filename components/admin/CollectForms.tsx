'use client';
import { startTransition, useActionState } from 'react';
import { approveCandidate, saveSource } from '@/app/admin/collect-actions';
import { PREFECTURES } from '@/lib/prefectures';

type Source = { id: number; name: string; kind: string; url: string; prefecture: string; trust: string; terms_checked_at: string; enabled: number; interval_hours: number; note: string };

/** 情報源の登録・編集（送信後も入力内容が消えないよう onSubmit で送る） */
export function SourceForm({ s }: { s?: Source }) {
  const [err, action, pending] = useActionState(saveSource, null);
  return (
    <form className="source-form" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="row">
        <input name="name" defaultValue={s?.name} placeholder="名前（例：〇〇市観光協会 イベント情報）" required />
        <select name="kind" defaultValue={s?.kind ?? 'page'}>
          <option value="page">ページ</option><option value="rss">RSS</option>
        </select>
      </div>
      <input name="url" defaultValue={s?.url} placeholder="https://..." required />
      <div className="row">
        <select name="prefecture" defaultValue={s?.prefecture ?? ''}>
          <option value="">都道府県（任意）</option>{PREFECTURES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select name="trust" defaultValue={s?.trust ?? 'public'}>
          <option value="official">公式サイト</option><option value="public">自治体・観光協会</option><option value="other">その他</option>
        </select>
        <select name="interval_hours" defaultValue={String(s?.interval_hours ?? 24)}>
          <option value="24">1日1回</option><option value="72">3日に1回</option><option value="168">週1回</option>
        </select>
      </div>
      <div className="row">
        <label className="small">利用規約の確認日 <input type="date" name="terms_checked_at" defaultValue={s?.terms_checked_at} /></label>
        <label className="small"><input type="checkbox" name="enabled" defaultChecked={!!s?.enabled} /> 巡回する</label>
      </div>
      <input name="note" defaultValue={s?.note} placeholder="メモ（規約の要点など・任意）" />
      {err && <div className="error-text">{err}</div>}
      <button className="btn sm" disabled={pending}>{s ? '保存' : '追加'}</button>
    </form>
  );
}

/** 候補の承認（開催日・都道府県が未確認なら、確認した値を入れて承認する） */
export function ApproveForm({ id, name, start, end, pref }: { id: number; name: string; start: string | null; end: string | null; pref: string | null }) {
  const [err, action, pending] = useActionState(approveCandidate, null);
  const needs = !start || !pref;
  return (
    <form className="approve-form" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
      {needs && (
        <div className="row">
          <label className="small">開始日 <input type="date" name="start_date" defaultValue={start ?? ''} /></label>
          <label className="small">終了日 <input type="date" name="end_date" defaultValue={end ?? ''} /></label>
          <select name="prefecture" defaultValue={pref ?? ''}>
            <option value="">都道府県</option>{PREFECTURES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {err && <div className="error-text">{err}</div>}
      <button className="btn sm" disabled={pending}>{pending ? '作成中…' : '承認して非公開イベントを作成'}</button>
    </form>
  );
}
