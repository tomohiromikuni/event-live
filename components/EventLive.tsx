'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { clockTime, EXPIRE_MIN, FRESH_MIN, freshness, LEVEL_COLORS, levelColor, relTime } from '@/lib/freshness';
import type { Category, Report, Spot } from '@/lib/types';
import type { MapMarker } from './LeafletMap';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="map"><div className="map-fallback">地図を読み込み中…</div></div>,
});

type Props = {
  eventId: number;
  center: [number, number];
  zoom: number;
  categories: Category[];
  spots: Spot[];
  initialReports: Report[];
  serverNow: number;
  postable: boolean;
  postBlockedReason: string;
};

const POLL_MS = 20_000;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export default function EventLive(p: Props) {
  const [reports, setReports] = useState<Report[]>(p.initialReports);
  const [skew] = useState(() => p.serverNow - Date.now()); // 端末時計のずれを補正
  const [now, setNow] = useState(p.serverNow);
  const [filter, setFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState(false);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

  const catById = useMemo(() => new Map(p.categories.map((c) => [c.id, c])), [p.categories]);
  const visibleSpots = useMemo(() => p.spots.filter((s) => catById.has(s.category_id)), [p.spots, catById]);
  const spotById = useMemo(() => new Map(visibleSpots.map((s) => [s.id, s])), [visibleSpots]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${p.eventId}/live`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { reports: Report[] };
      setReports(data.reports);
    } catch { /* オフライン時は前回の表示を維持 */ }
  }, [p.eventId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + skew), 15_000);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now() + skew); refresh(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(tick); clearInterval(poll); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh, skew]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /** 地点ごとの「現在の状況」= 有効期限内の最新投稿 */
  const latestBySpot = useMemo(() => {
    const m = new Map<number, Report>();
    for (const r of reports) {
      if (freshness(r.created_at, now) === 'expired') continue;
      const cur = m.get(r.spot_id);
      if (!cur || cur.created_at < r.created_at) m.set(r.spot_id, r);
    }
    return m;
  }, [reports, now]);

  const recentCount = (spotId: number) =>
    reports.filter((r) => r.spot_id === spotId && freshness(r.created_at, now) === 'fresh').length;

  const markers: MapMarker[] = useMemo(() => visibleSpots
    .filter((s) => filter === null || s.category_id === filter)
    .map((s) => {
      const c = catById.get(s.category_id)!;
      const latest = latestBySpot.get(s.id);
      const stale = latest && freshness(latest.created_at, now) === 'stale';
      const border = c.options.length ? levelColor(latest?.level) : c.color;
      const badge = latest && !stale ? `<span class="mk-badge" style="background:${levelColor(latest.level)}">${escapeHtml(latest.label)}</span>` : '';
      return {
        id: s.id, lat: s.lat, lng: s.lng, title: s.name,
        html: `<div class="mk${selected === s.id ? ' selected' : ''}${stale ? ' stale' : ''}" style="border-color:${border}">${c.icon}${badge}</div>`,
      };
    }), [visibleSpots, filter, catById, latestBySpot, selected, now]);

  async function post(spotId: number, value: string) {
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spotId, value }) });
      const data = await res.json();
      if (data.ok) {
        setReports((rs) => [{ ...data.report, event_id: p.eventId }, ...rs]);
        setNow(Date.now() + skew);
        setSelected(null);
        setToast({ msg: '投稿しました。ありがとうございます！' });
      } else {
        setToast({ msg: data.error ?? '投稿できませんでした', error: true });
      }
    } catch {
      setToast({ msg: '通信エラーが発生しました', error: true });
    } finally {
      setPosting(false);
    }
  }

  async function flag(reportId: number) {
    if (!confirm('この投稿を不適切な投稿として通報しますか？')) return;
    const res = await fetch(`/api/reports/${reportId}/flag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    setFlagged((s) => new Set(s).add(reportId));
    setToast(data.ok ? { msg: '通報を受け付けました' } : { msg: data.error ?? '通報できませんでした', error: true });
  }

  const sel = selected != null ? spotById.get(selected) : undefined;
  const selCat = sel ? catById.get(sel.category_id) : undefined;
  const selLatest = sel ? latestBySpot.get(sel.id) : undefined;
  const feed = reports.filter((r) => spotById.has(r.spot_id)).slice(0, 30);
  const usedCats = p.categories.filter((c) => visibleSpots.some((s) => s.category_id === c.id));

  return (
    <div className="live-card" id="live">
      <div className="live-head">
        <strong><span className="live-dot" />現地のリアルタイム情報</strong>
        <span className="muted">自動更新中</span>
      </div>
      {!p.postable && <div className="notice">ℹ️ {p.postBlockedReason}</div>}
      {p.postable && <div className="notice">📍 地図またはリストの地点をタップすると、状況をワンタップで投稿できます（登録不要）</div>}

      <LeafletMap center={p.center} zoom={p.zoom} markers={markers} fitToMarkers
        onMarkerClick={setSelected} focus={sel ? { lat: sel.lat, lng: sel.lng } : null} />

      <div className="legend">
        {['良好', 'やや', '混雑', '非常に', '利用不可'].map((l, i) => <span key={l}><i style={{ background: LEVEL_COLORS[i] }} />{l}</span>)}
        <span><i style={{ background: '#94a3b8' }} />情報なし</span>
        <span>点線＝{FRESH_MIN}分以上前</span>
      </div>

      <nav className="chips" style={{ padding: '10px 14px', margin: 0, borderTop: '1px solid var(--border)' }} aria-label="カテゴリ">
        <button className={`chip ${filter === null ? 'active' : ''}`} onClick={() => setFilter(null)}>すべて</button>
        {usedCats.map((c) => (
          <button key={c.id} className={`chip ${filter === c.id ? 'active' : ''}`} onClick={() => setFilter(filter === c.id ? null : c.id)}>
            {c.icon} {c.name}
          </button>
        ))}
      </nav>

      <div className="spot-list">
        {visibleSpots.filter((s) => filter === null || s.category_id === filter).map((s) => {
          const c = catById.get(s.category_id)!;
          const latest = latestBySpot.get(s.id);
          const fr = latest ? freshness(latest.created_at, now) : null;
          const n = recentCount(s.id);
          return (
            <button key={s.id} className="spot-item" onClick={() => setSelected(s.id)}>
              <span className="spot-icon" style={{ borderColor: c.options.length ? levelColor(latest?.level) : c.color }}>{c.icon}</span>
              <span className="spot-main">
                <span className="spot-name">{s.name}</span>
                <span className="spot-sub">
                  {c.name}
                  {latest ? `・${fr === 'stale' ? `⚠️ ${relTime(latest.created_at, now)}の情報` : relTime(latest.created_at, now)}` : ''}
                  {n > 1 ? `・直近${FRESH_MIN}分で${n}件` : ''}
                </span>
              </span>
              {c.options.length === 0 ? (
                <span className="status-pill none">施設情報</span>
              ) : latest ? (
                <span className={`status-pill ${fr === 'stale' ? 'stale' : ''}`} style={{ background: levelColor(latest.level) }}>{latest.label}</span>
              ) : (
                <span className="status-pill none">現在の情報はありません</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="live-head" style={{ borderTop: '1px solid var(--border)' }}>
        <strong>最新の投稿</strong>
        <span className="muted small">{EXPIRE_MIN}分以上前の情報は現在の状況に反映されません</span>
      </div>
      <div className="feed">
        {feed.length === 0 && <div className="feed-item muted">まだ投稿はありません</div>}
        {feed.map((r) => {
          const s = spotById.get(r.spot_id)!;
          const c = catById.get(s.category_id)!;
          const fr = freshness(r.created_at, now);
          return (
            <div key={r.id} className={`feed-item ${fr !== 'fresh' ? 'stale' : ''}`}>
              <span className="time">{clockTime(r.created_at)}<br />{relTime(r.created_at, now)}</span>
              <span className="what">{c.icon} {s.name}　<strong style={{ color: levelColor(r.level) }}>{r.label}</strong></span>
              {!flagged.has(r.id) && <button className="flag-btn" onClick={() => flag(r.id)} aria-label="通報">通報</button>}
            </div>
          );
        })}
      </div>

      {sel && selCat && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelected(null)} />
          <div className="sheet" role="dialog" aria-label={`${sel.name}の状況`}>
            <div className="sheet-grip" />
            <div className="muted small">{selCat.icon} {selCat.name}</div>
            <h3>{sel.name}</h3>
            {sel.note && <div className="muted small">{sel.note}</div>}
            {selCat.options.length > 0 ? (
              <>
                <div className="current">
                  現在の状況：
                  {selLatest ? (
                    <>
                      <strong style={{ color: levelColor(selLatest.level) }}>{selLatest.label}</strong>
                      <span className="muted">（{clockTime(selLatest.created_at)}投稿・
                        {freshness(selLatest.created_at, now) === 'stale' ? `${relTime(selLatest.created_at, now)}の情報のため現在と異なる可能性があります` : relTime(selLatest.created_at, now)}）</span>
                    </>
                  ) : <span className="muted">現在の情報はありません</span>}
                </div>
                {p.postable ? (
                  <>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>いまの状況を教えてください</div>
                    <div className="option-grid">
                      {selCat.options.map((o) => (
                        <button key={o.value} className="option-btn" disabled={posting}
                          style={{ borderColor: levelColor(o.level), color: levelColor(o.level) }}
                          onClick={() => post(sel.id, o.value)}>{o.label}</button>
                      ))}
                    </div>
                    <p className="muted small" style={{ marginBottom: 0 }}>投稿は匿名で、投稿時刻とともに公開されます。</p>
                  </>
                ) : <p className="muted small">{p.postBlockedReason}</p>}
              </>
            ) : <p className="muted small">この地点は施設の位置情報のみ掲載しています。</p>}
            <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setSelected(null)}>閉じる</button>
          </div>
        </>
      )}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.msg}</div>}
    </div>
  );
}
