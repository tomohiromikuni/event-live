'use client';
import { useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { addSpot, deleteSpot, moveSpot, updateSpot } from '@/app/admin/actions';
import type { Category, Spot } from '@/lib/types';

const LeafletMap = dynamic(() => import('../LeafletMap'), { ssr: false, loading: () => <div className="admin-map" /> });

type Props = { eventId: number; center: [number, number]; zoom: number; spots: Spot[]; categories: Category[] };

/** 会場マップ編集: 地図クリックで新規地点の位置を指定、既存地点はドラッグで移動 */
export default function SpotEditor({ eventId, center, zoom, spots, categories }: Props) {
  const router = useRouter();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState('');
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const markers = useMemo(() => [
    ...spots.map((s) => ({
      id: s.id, lat: s.lat, lng: s.lng, title: s.name, draggable: true,
      html: `<div class="mk" style="border-color:${catById.get(s.category_id)?.color ?? '#94a3b8'}">${catById.get(s.category_id)?.icon ?? '❓'}</div>`,
    })),
    ...(pos ? [{ id: -1, lat: pos.lat, lng: pos.lng, title: '新しい地点', html: '<div class="mk" style="border-color:#0f766e;background:#ccfbf1">＋</div>' }] : []),
  ], [spots, pos, catById]);

  return (
    <div className="panel">
      <h2>会場マップ・地点（{spots.length}件）</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        地図をタップして新しい地点の位置を指定 → 下のフォームで登録。既存のマーカーはドラッグで位置を変更できます。
        公式の会場案内図は施設位置の参考にのみ使い、画像自体は転載しないでください。
      </p>
      <LeafletMap className="admin-map" center={center} zoom={zoom} markers={markers} fitToMarkers
        onMapClick={(lat, lng) => setPos({ lat, lng })}
        onMarkerDragEnd={(id, lat, lng) => { if (id > 0) start(async () => { await moveSpot(id, lat, lng); setMsg('位置を更新しました'); router.refresh(); }); }} />
      {msg && <div className="flash">{msg}</div>}

      <form action={async (f) => { await addSpot(f); setPos(null); setMsg('地点を追加しました'); router.refresh(); }} className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="event_id" value={eventId} />
        <div className="two">
          <div className="field">
            <label>カテゴリ</label>
            <select name="category_id">{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
          </div>
          <div className="field"><label>地点名</label><input name="name" required placeholder="例: 仮設トイレ（北口）" /></div>
        </div>
        <div className="two">
          <div className="field"><label>緯度</label><input name="lat" type="number" step="any" required value={pos?.lat ?? ''} onChange={(e) => setPos({ lat: Number(e.target.value), lng: pos?.lng ?? 0 })} /></div>
          <div className="field"><label>経度</label><input name="lng" type="number" step="any" required value={pos?.lng ?? ''} onChange={(e) => setPos({ lat: pos?.lat ?? 0, lng: Number(e.target.value) })} /></div>
        </div>
        <div className="field"><label>メモ（任意）</label><input name="note" placeholder="例: 約200台" /></div>
        <button className="btn" disabled={!pos}>{pos ? 'この位置に地点を追加' : '地図をタップして位置を指定'}</button>
      </form>

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead><tr><th>カテゴリ</th><th>地点名・メモ</th><th></th></tr></thead>
          <tbody>
            {spots.map((s) => (
              <tr key={s.id}>
                <td colSpan={3} style={{ padding: 0 }}>
                  <form action={async (f) => { await updateSpot(f); setMsg('地点を更新しました'); router.refresh(); }}
                    style={{ display: 'flex', gap: 6, padding: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="hidden" name="id" value={s.id} /><input type="hidden" name="event_id" value={eventId} />
                    <select name="category_id" defaultValue={s.category_id} className="input" style={{ width: 150, height: 34, fontSize: 13 }}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      {!catById.has(s.category_id) && <option value={s.category_id}>（このイベントで非表示のカテゴリ）</option>}
                    </select>
                    <input name="name" defaultValue={s.name} className="input" style={{ flex: 2, minWidth: 140, height: 34, fontSize: 13 }} />
                    <input name="note" defaultValue={s.note} placeholder="メモ" className="input" style={{ flex: 1, minWidth: 90, height: 34, fontSize: 13 }} />
                    <button className="btn sm">更新</button>
                    <button className="btn sm danger" formAction={async (f) => {
                      if (!confirm(`「${s.name}」を削除しますか？（この地点への投稿も削除されます）`)) return;
                      await deleteSpot(f); setMsg('地点を削除しました'); router.refresh();
                    }}>削除</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
