'use client';
import { useActionState, useState } from 'react';
import { draftFromMyMap, importDraft, type ImportResult, type MyMapResult } from '@/app/admin/import-actions';

type Props = { events: { id: number; name: string }[]; defaultMode?: string; defaultMapUrl?: string };

export default function ImportForm({ events, defaultMode = 'new', defaultMapUrl = '' }: Props) {
  const [res, action, pending] = useActionState<ImportResult | null, FormData>(importDraft, null);
  const [mode, setMode] = useState(defaultMode);
  const [json, setJson] = useState(''); // 送信後もフォームが空にならないよう、内容を自分で保持する
  const [mapUrl, setMapUrl] = useState(defaultMapUrl); // 自動収集の候補から来たときは公式マイマップのURLが入る
  const [mm, setMm] = useState<MyMapResult | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="mode">取り込み先</label>
        <select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="new">新しいイベントとして登録（非公開で作成 → 確認後に公開）</option>
          {events.map((e) => <option key={e.id} value={e.id}>既存のイベントにマップを追加：{e.name}</option>)}
        </select>
      </div>
      <div className="field" style={{ background: '#f8fafc', border: '1px dashed var(--border)', borderRadius: 10, padding: 12 }}>
        <label htmlFor="mymap">Google マイマップから作る（公式が公開している地図のURL）</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="mymap" className="input" value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://www.google.com/maps/d/viewer?mid=..." />
          <button type="button" className="btn ghost" disabled={!mapUrl || loadingMap} onClick={async () => {
            setLoadingMap(true); setMm(null);
            const r = await draftFromMyMap(mapUrl);
            setMm(r); if (r.json) setJson(r.json); setLoadingMap(false);
          }}>{loadingMap ? '読み込み中…' : '読み込む'}</button>
        </div>
        {mm && (
          <div className="small" style={{ marginTop: 8, color: mm.ok ? '#134e4a' : '#991b1b' }}>
            {mm.ok ? '✅ ' : '⚠️ '}{mm.message}
            {mm.ok && <div className="muted">下の下書き欄に入りました。施設の名前・種類を確認し、イベント情報（event）が無い場合は「取り込み先」で登録済みのイベントを選んでください。</div>}
            {!!mm.skipped?.length && (
              <details style={{ marginTop: 4 }}><summary>含めなかったもの（{mm.skipped.length}件）</summary><div className="muted">{mm.skipped.join(' / ')}</div></details>
            )}
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="json">下書き（Claude から受け取った内容をそのまま貼り付け）</label>
        <textarea id="json" name="json" required rows={14} value={json} onChange={(e) => setJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder='{ "version": 1, "event": { ... }, "map": { ... } }' />
      </div>
      {res && (
        <div className={res.ok ? 'flash' : ''} style={res.ok ? undefined : { background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 10, fontSize: 14 }}>
          {res.ok ? <div>✅ 問題ありません：{res.summary}</div> : <div><strong>取り込めません</strong>（下の点を直してください）</div>}
          {res.errors.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{res.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {res.warnings.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#92400e' }}>{res.warnings.map((e, i) => <li key={i}>⚠️ {e}</li>)}</ul>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" name="dry" value="1" disabled={pending}>内容をチェック</button>
        <button className="btn" disabled={pending}>{pending ? '取り込み中…' : '取り込む'}</button>
      </div>
    </form>
  );
}
