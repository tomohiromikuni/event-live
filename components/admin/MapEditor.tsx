'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type * as L from 'leaflet';
import { addShape, addSpot, deleteShape, deleteSpot, moveSpot, setCanvasSize, updateShape, updateSpot } from '@/app/admin/actions';
import { CANVAS_W } from '@/lib/canvas';
import { SHAPE_STYLES, shapeStyle, type MapShape, type ShapeKind } from '@/lib/shapes';
import type { Category, Spot } from '@/lib/types';

const LeafletMap = dynamic(() => import('../LeafletMap'), { ssr: false, loading: () => <div className="admin-map" /> });

type Props = { eventId: number; canvas: { w: number; h: number }; spots: Spot[]; shapes: MapShape[]; categories: Category[] };
type Mode = 'spot' | 'area' | 'line';

const HINTS: Record<Mode, string> = {
  spot: 'ガイドマップでトイレなどがある場所をタップ → 下のフォームで登録。置いた施設はドラッグで動かせます。',
  area: 'エリアの角を順番にタップして囲み、「完成」を押します（3点以上）。',
  line: '通路やルートの曲がり角を順番にタップし、「完成」を押します（2点以上）。',
};

/**
 * 簡易マップ（見取り図）の作図画面。
 * ガイドマップ画像は「下敷き」としてこのブラウザ内でだけ使い、サーバーには送信・保存しない（公開もされない）。
 */
export default function MapEditor({ eventId, canvas, spots, shapes, categories }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [mode, setMode] = useState<Mode>('spot');
  const [msg, setMsg] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [verts, setVerts] = useState<[number, number][]>([]);
  const [finishing, setFinishing] = useState(false);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // 下敷き（ガイドマップ）
  const [guideUrl, setGuideUrl] = useState<string | null>(null);
  const [guideRatio, setGuideRatio] = useState(1); // 画像の 高さ/幅
  const [opacity, setOpacity] = useState(0.5);
  const [showGuide, setShowGuide] = useState(true);
  const [mapInst, setMapInst] = useState<{ map: L.Map; lib: typeof L } | null>(null);

  // 下敷きを用紙いっぱいに表示（用紙の比率は画像に合わせてある）
  useEffect(() => {
    if (!mapInst || !guideUrl || !showGuide) return;
    const { map, lib } = mapInst;
    if (!map.getPane('underlay')) map.createPane('underlay').style.zIndex = '350';
    // 用紙の中に、画像の縦横比を保ったまま中央に収める
    let w = canvas.w, h = canvas.w * guideRatio;
    if (h > canvas.h) { h = canvas.h; w = canvas.h / guideRatio; }
    const x0 = (canvas.w - w) / 2, y0 = (canvas.h - h) / 2;
    const ov = lib.imageOverlay(guideUrl, [[y0, x0], [y0 + h, x0 + w]], { pane: 'underlay', opacity, interactive: false }).addTo(map);
    return () => { ov.remove(); };
  }, [mapInst, guideUrl, guideRatio, showGuide, opacity, canvas.h, canvas.w]);

  // 作図中のプレビュー
  useEffect(() => {
    if (!mapInst) return;
    const { map, lib } = mapInst;
    const layer = lib.layerGroup().addTo(map);
    if (verts.length > 1) {
      const opt = { color: '#0f172a', weight: 3, dashArray: '6 6', interactive: false };
      (mode === 'area' && verts.length > 2 ? lib.polygon(verts, { ...opt, fillOpacity: 0.1 }) : lib.polyline(verts, opt)).addTo(layer);
    }
    verts.forEach((v) => lib.marker(v, { icon: lib.divIcon({ className: '', html: '<div class="vertex-dot"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), interactive: false }).addTo(layer));
    return () => { layer.remove(); };
  }, [verts, mode, mapInst]);

  function switchMode(m: Mode) {
    setMode(m);
    setVerts([]);
    setFinishing(false);
    setPos(null);
    setMsg('');
  }

  function onMapClick(y: number, x: number) {
    if (y < 0 || x < 0 || y > canvas.h || x > canvas.w) return; // 用紙の外は無視
    if (mode === 'spot') setPos({ lat: y, lng: x });
    else if (!finishing) setVerts((v) => [...v, [+y.toFixed(1), +x.toFixed(1)]]);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f); // ブラウザ内だけで使う（アップロードしない）
    const img = new Image();
    img.onload = () => {
      if (guideUrl) URL.revokeObjectURL(guideUrl);
      setGuideRatio(img.naturalHeight / img.naturalWidth);
      setGuideUrl(url);
      // まだ何も描いていなければ、用紙の縦横比をガイドマップに合わせる（描いた後は用紙を変えず、画像を用紙に収める）
      const h = Math.round((CANVAS_W * img.naturalHeight) / img.naturalWidth);
      if (!spots.length && !shapes.length && Math.abs(h - canvas.h) > 2) {
        start(async () => { await setCanvasSize(eventId, h); router.refresh(); });
      }
    };
    img.src = url;
  }

  const kind: ShapeKind | null = mode === 'area' ? 'area' : mode === 'line' ? 'line' : null;
  const markers = useMemo(() => [
    ...spots.map((s) => ({
      id: s.id, lat: s.lat, lng: s.lng, title: s.name, draggable: mode === 'spot',
      html: `<div class="mk" style="border-color:${catById.get(s.category_id)?.color ?? '#94a3b8'}">${catById.get(s.category_id)?.icon ?? '❓'}</div>`,
    })),
    ...(pos ? [{ id: -1, lat: pos.lat, lng: pos.lng, title: '新しい施設', html: '<div class="mk" style="border-color:#0f766e;background:#ccfbf1">＋</div>' }] : []),
  ], [spots, pos, catById, mode]);

  const refresh = (m: string) => { setMsg(m); router.refresh(); };

  return (
    <div className="panel">
      <h2>会場マップ（簡易マップ）</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        運営のガイドマップを下敷きにして、トイレ・屋台などの位置を描き写します。ガイドマップ画像はこのブラウザ内でのみ表示され、保存・公開されません。
        絵や配色はなぞらず、エリア・線・施設の位置だけを描いてください。主催者が利用を禁止している場合は使わないでください。
      </p>

      <div className="tool-guide">
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          🗺️ ガイドマップを読み込む
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} hidden />
        </label>
        {guideUrl && (
          <>
            <label className="small"><input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} /> 下敷きを表示</label>
            <label className="small">濃さ <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
          </>
        )}
        {!guideUrl && <span className="muted small">PNG・JPG（PDFは該当ページを画像にしてから）</span>}
      </div>

      <div className="tool-bar" role="toolbar">
        <button className={mode === 'spot' ? 'on' : ''} onClick={() => switchMode('spot')}>📍 施設を置く</button>
        <button className={mode === 'area' ? 'on' : ''} onClick={() => switchMode('area')}>⬛ エリアを描く</button>
        <button className={mode === 'line' ? 'on' : ''} onClick={() => switchMode('line')}>〰️ 線を描く</button>
      </div>
      <div className="tool-hint">{HINTS[mode]}</div>

      <LeafletMap key={`${canvas.w}x${canvas.h}`} className="admin-map" canvas={canvas} markers={markers} shapes={shapes}
        onReady={(map, lib) => setMapInst({ map, lib })} onMapClick={onMapClick}
        onMarkerDragEnd={(id, y, x) => { if (id > 0) start(async () => { await moveSpot(id, y, x); refresh('施設の位置を更新しました'); }); }} />
      {msg && <div className="flash">{msg}</div>}

      {/* エリア・線の作図 */}
      {kind && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="small" style={{ alignSelf: 'center' }}>{verts.length}点</span>
            <button className="btn ghost sm" disabled={!verts.length || finishing} onClick={() => setVerts((v) => v.slice(0, -1))}>1つ戻す</button>
            <button className="btn ghost sm" disabled={!verts.length} onClick={() => { setVerts([]); setFinishing(false); }}>やめる</button>
            <button className="btn sm" disabled={verts.length < (kind === 'area' ? 3 : 2) || finishing} onClick={() => setFinishing(true)}>完成</button>
          </div>
          {finishing && (
            <form className="two" action={async (f) => {
              const err = await addShape(eventId, String(f.get('style')), String(f.get('label') ?? ''), verts);
              if (err) { setMsg(err); return; }
              setVerts([]); setFinishing(false); refresh(kind === 'area' ? 'エリアを追加しました' : '線を追加しました');
            }}>
              <div className="field">
                <label>種類</label>
                <select name="style">{SHAPE_STYLES.filter((s) => s.kind === kind).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
              </div>
              <div className="field"><label>表示名（任意）</label><input name="label" maxLength={40} placeholder={kind === 'area' ? '例: 観覧エリアA' : '例: 帰りの推奨ルート'} /></div>
              <button className="btn">保存</button>
            </form>
          )}
        </div>
      )}

      {/* 施設の追加 */}
      {mode === 'spot' && (
        <form action={async (f) => { await addSpot(f); setPos(null); refresh('施設を追加しました'); }} className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="lat" value={pos?.lat ?? ''} />
          <input type="hidden" name="lng" value={pos?.lng ?? ''} />
          <div className="two">
            <div className="field">
              <label>カテゴリ</label>
              <select name="category_id">{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
            </div>
            <div className="field"><label>施設名</label><input name="name" required placeholder="例: 仮設トイレ（北口）" /></div>
          </div>
          <div className="field"><label>メモ（任意）</label><input name="note" placeholder="例: 約200台" /></div>
          <button className="btn" disabled={!pos}>{pos ? 'この位置に施設を追加' : 'マップをタップして位置を指定'}</button>
        </form>
      )}

      {/* 登録済みのエリア・線 */}
      <h2 style={{ fontSize: 14, marginTop: 18 }}>エリア・線（{shapes.length}件）</h2>
      <div className="table-wrap">
        <table className="table"><tbody>
          {shapes.length === 0 && <tr><td className="muted">まだありません。「エリアを描く」「線を描く」から追加できます。</td></tr>}
          {shapes.map((s) => (
            <tr key={s.id}><td style={{ padding: 0 }}>
              <form action={async (f) => { await updateShape(f); refresh('更新しました'); }} style={{ display: 'flex', gap: 6, padding: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="event_id" value={eventId} />
                <span style={{ width: 14, height: 14, borderRadius: s.kind === 'area' ? 3 : 7, background: shapeStyle(s.style).color }} />
                <select name="style" defaultValue={s.style} className="input" style={{ width: 150, height: 34, fontSize: 13 }}>
                  {SHAPE_STYLES.filter((x) => x.kind === s.kind).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
                <input name="label" defaultValue={s.label} placeholder="表示名" className="input" style={{ flex: 1, minWidth: 120, height: 34, fontSize: 13 }} />
                <button className="btn sm">更新</button>
                <button className="btn sm danger" formAction={async (f) => { if (!confirm('削除しますか？')) return; await deleteShape(f); refresh('削除しました'); }}>削除</button>
              </form>
            </td></tr>
          ))}
        </tbody></table>
      </div>

      {/* 登録済みの施設 */}
      <h2 style={{ fontSize: 14, marginTop: 18 }}>施設（{spots.length}件）</h2>
      <div className="table-wrap">
        <table className="table"><tbody>
          {spots.map((s) => (
            <tr key={s.id}><td style={{ padding: 0 }}>
              <form action={async (f) => { await updateSpot(f); refresh('施設を更新しました'); }} style={{ display: 'flex', gap: 6, padding: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="event_id" value={eventId} />
                <select name="category_id" defaultValue={s.category_id} className="input" style={{ width: 150, height: 34, fontSize: 13 }}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  {!catById.has(s.category_id) && <option value={s.category_id}>（このイベントで非表示のカテゴリ）</option>}
                </select>
                <input name="name" defaultValue={s.name} className="input" style={{ flex: 2, minWidth: 140, height: 34, fontSize: 13 }} />
                <input name="note" defaultValue={s.note} placeholder="メモ" className="input" style={{ flex: 1, minWidth: 90, height: 34, fontSize: 13 }} />
                <button className="btn sm">更新</button>
                <button className="btn sm danger" formAction={async (f) => {
                  if (!confirm(`「${s.name}」を削除しますか？（この施設への投稿も削除されます）`)) return;
                  await deleteSpot(f); refresh('施設を削除しました');
                }}>削除</button>
              </form>
            </td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
