'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type * as L from 'leaflet';
import { addShape, addSpot, deleteShape, deleteSpot, moveSpot, updateShape, updateSpot } from '@/app/admin/actions';
import { SHAPE_STYLES, shapeStyle, type MapShape, type ShapeKind } from '@/lib/shapes';
import type { Category, Spot } from '@/lib/types';

const LeafletMap = dynamic(() => import('../LeafletMap'), { ssr: false, loading: () => <div className="admin-map" /> });

type Props = { eventId: number; center: [number, number]; zoom: number; mapStyle: string; spots: Spot[]; shapes: MapShape[]; categories: Category[] };
type Mode = 'spot' | 'area' | 'line' | 'align';
type Pair = { img: [number, number]; geo?: [number, number] };

const HINTS: Record<Mode, string> = {
  spot: '地図をタップして施設の位置を指定 → 下のフォームで登録。既存の施設はドラッグで移動できます。',
  area: 'エリアの角を順番にタップして囲み、「完成」を押します（3点以上）。',
  line: '通路やルートの曲がり角を順番にタップし、「完成」を押します（2点以上）。',
  align: '① 下のガイドマップ上の目印（ゲートなど）をタップ → ② 地図上の同じ場所をタップ。これを2か所行うと重なります。',
};

/**
 * 簡易マップの作図画面。
 * ガイドマップ画像は「下敷き」としてこのブラウザ内でだけ使い、サーバーには送信・保存しない（公開もされない）。
 */
export default function MapEditor({ eventId, center, zoom, mapStyle, spots, shapes, categories }: Props) {
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
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [opacity, setOpacity] = useState(0.6);
  const [showGuide, setShowGuide] = useState(true);
  const [guideSize, setGuideSize] = useState<[number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<L.LayerGroup | null>(null);
  const aligned = pairs.length >= 2 && pairs.every((p) => p.geo);

  function onReady(map: L.Map, lib: typeof L) {
    mapRef.current = map;
    libRef.current = lib;
    const pane = map.createPane('underlay');
    pane.style.zIndex = '350'; // タイル(200)より上、図形(400)・マーカー(600)より下
    previewRef.current = lib.layerGroup().addTo(map);
    map.on('zoomend viewreset resize', placeUnderlay);
    placeUnderlay();
  }

  /** 2組の対応点から相似変換（拡大・回転・移動）を求めて、画像を地図に重ねる */
  function placeUnderlay() {
    const map = mapRef.current, img = imgRef.current;
    if (!map || !img) return;
    const ps = pairsRef.current;
    const ok = ps.length >= 2 && ps[0].geo && ps[1].geo;
    img.style.display = ok && showRef.current ? 'block' : 'none';
    if (!ok) return;
    const L1 = map.latLngToLayerPoint(ps[0].geo!), L2 = map.latLngToLayerPoint(ps[1].geo!);
    const [p1x, p1y] = ps[0].img, [p2x, p2y] = ps[1].img;
    const dpx = p2x - p1x, dpy = p2y - p1y, dlx = L2.x - L1.x, dly = L2.y - L1.y;
    const den = dpx * dpx + dpy * dpy || 1;
    const ar = (dlx * dpx + dly * dpy) / den, ai = (dly * dpx - dlx * dpy) / den; // a = ΔL / ΔP（複素数の割り算）
    const bx = L1.x - (ar * p1x - ai * p1y), by = L1.y - (ai * p1x + ar * p1y);
    img.style.transform = `matrix(${ar}, ${ai}, ${-ai}, ${ar}, ${bx}, ${by})`;
  }
  const pairsRef = useRef(pairs); pairsRef.current = pairs;
  const showRef = useRef(showGuide); showRef.current = showGuide;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !guideUrl) return;
    const img = document.createElement('img');
    img.src = guideUrl;
    img.className = 'underlay-img';
    img.alt = '';
    img.onload = placeUnderlay;
    map.getPane('underlay')!.appendChild(img);
    imgRef.current = img;
    return () => { img.remove(); imgRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideUrl]);

  useEffect(() => { if (imgRef.current) imgRef.current.style.opacity = String(opacity); }, [opacity, guideUrl]);
  useEffect(placeUnderlay, [pairs, showGuide]); // eslint-disable-line react-hooks/exhaustive-deps

  // 作図中のプレビュー
  useEffect(() => {
    const lib = libRef.current, layer = previewRef.current;
    if (!lib || !layer) return;
    layer.clearLayers();
    if (verts.length > 1) {
      const opt = { color: '#0f172a', weight: 3, dashArray: '6 6', interactive: false };
      (mode === 'area' && verts.length > 2 ? lib.polygon(verts, { ...opt, fillOpacity: 0.1 }) : lib.polyline(verts, opt)).addTo(layer);
    }
    verts.forEach((v) => lib.marker(v, { icon: lib.divIcon({ className: '', html: '<div class="vertex-dot"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), interactive: false }).addTo(layer));
  }, [verts, mode]);

  function switchMode(m: Mode) {
    setMode(m);
    setVerts([]);
    setFinishing(false);
    setPos(null);
    setMsg('');
  }

  function onMapClick(lat: number, lng: number) {
    if (mode === 'spot') setPos({ lat, lng });
    else if ((mode === 'area' || mode === 'line') && !finishing) setVerts((v) => [...v, [lat, lng]]);
    else if (mode === 'align') {
      const last = pairs[pairs.length - 1];
      if (last && !last.geo) setPairs((ps) => ps.map((p, i) => (i === ps.length - 1 ? { ...p, geo: [lat, lng] } : p)));
      else setMsg('先に下のガイドマップ上で目印をタップしてください');
    }
  }

  function onGuideClick(e: React.MouseEvent<HTMLImageElement>) {
    if (mode !== 'align') return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * el.naturalWidth;
    const y = ((e.clientY - r.top) / r.height) * el.naturalHeight;
    setMsg('');
    setPairs((ps) => {
      const done = ps.filter((p) => p.geo);
      const base = done.length >= 2 ? [] : done; // 3組目を始めたらやり直し
      return [...base, { img: [x, y] }];
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (guideUrl) URL.revokeObjectURL(guideUrl);
    setGuideSize(null);
    setGuideUrl(URL.createObjectURL(f)); // ブラウザ内だけで使う（アップロードしない）
    setPairs([]);
    switchMode('align');
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
  const pending = pairs.length > 0 && !pairs[pairs.length - 1].geo;

  return (
    <div className="panel">
      <h2>会場マップ（簡易マップ）</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        公式ガイドマップは<strong>位置の参考</strong>として下敷きにだけ使い、画像はこのブラウザ内でのみ表示されます（保存・公開されません）。
        絵や配色はなぞらず、エリア・線・施設の位置だけを描いてください。主催者が利用を禁止している場合は使わないでください。
      </p>

      <div className="tool-bar" role="toolbar">
        <button className={mode === 'spot' ? 'on' : ''} onClick={() => switchMode('spot')}>📍 施設を置く</button>
        <button className={mode === 'area' ? 'on' : ''} onClick={() => switchMode('area')}>⬛ エリアを描く</button>
        <button className={mode === 'line' ? 'on' : ''} onClick={() => switchMode('line')}>〰️ 線を描く</button>
        <button className={mode === 'align' ? 'on' : ''} onClick={() => switchMode('align')} disabled={!guideUrl}>🧭 下敷きの位置合わせ</button>
      </div>
      <div className="tool-hint">{HINTS[mode]}</div>

      <LeafletMap className="admin-map" center={center} zoom={zoom} mapStyle={mapStyle} markers={markers} shapes={shapes} fitToMarkers
        onReady={onReady} onMapClick={onMapClick}
        onMarkerDragEnd={(id, lat, lng) => { if (id > 0) start(async () => { await moveSpot(id, lat, lng); refresh('施設の位置を更新しました'); }); }} />
      {msg && <div className="flash">{msg}</div>}

      {/* 下敷き */}
      <div className="panel" style={{ background: '#f8fafc' }}>
        <h2 style={{ fontSize: 14 }}>🗺️ ガイドマップを下敷きにする（任意）</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} aria-label="ガイドマップ画像" />
          {guideUrl && (
            <>
              <label className="small"><input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} /> 地図に重ねる</label>
              <label className="small">濃さ <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
              <button className="btn ghost sm" onClick={() => { setPairs([]); switchMode('align'); }}>位置合わせをやり直す</button>
            </>
          )}
        </div>
        <p className="muted small">PDFの場合は、該当ページを画像（スクリーンショット）にしてから選んでください。</p>
        {guideUrl && (
          <>
            <div className="small" style={{ fontWeight: 700, margin: '6px 0' }}>
              {aligned ? '✅ 位置合わせ完了。地図に重なっています。' : pending ? `② 地図上で、目印${pairs.length}と同じ場所をタップ` : `① ガイドマップ上の目印${pairs.length + 1}をタップ（あと${2 - pairs.filter((p) => p.geo).length}か所）`}
            </div>
            <div className="guide-picker">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guideUrl} alt="ガイドマップ（下敷き）" onClick={onGuideClick}
                onLoad={(e) => setGuideSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
              {guideSize && pairs.map((p, i) => (
                <span key={i} className="pin" style={{ left: `${(p.img[0] / guideSize[0]) * 100}%`, top: `${(p.img[1] / guideSize[1]) * 100}%` }}>{i + 1}</span>
              ))}
            </div>
          </>
        )}
      </div>

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
          <button className="btn" disabled={!pos}>{pos ? 'この位置に施設を追加' : '地図をタップして位置を指定'}</button>
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
