'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import KindIcon from '@/components/Icon';
import { iconHtml } from '@/lib/icons';
import { clockTime, FRESH_MIN, freshness, LEVEL_COLORS, levelColor, relTime } from '@/lib/freshness';
import { consensus, consensusNote, type Consensus } from '@/lib/consensus';
import type { Category, Report, Spot } from '@/lib/types';
import type { MapMarker } from './LeafletMap';
import ShareButtons from './ShareButtons';
import { composePost, shareUrl } from '@/lib/share';
import { PUBLIC_SPOT_CATS, simplifyShapes, type MapShape } from '@/lib/shapes';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="map"><div className="map-fallback">地図を読み込み中…</div></div>,
});

type Props = {
  eventId: number;
  eventName: string;
  canvas: { w: number; h: number };
  geo?: boolean;
  /** かんたん表示（会場マップなし。項目の一覧だけで状況を共有） */
  simple?: boolean;
  center?: [number, number];
  categories: Category[];
  spots: Spot[];
  shapes: MapShape[];
  initialReports: Report[];
  serverNow: number;
  postable: boolean;
  postBlockedReason: string;
  /** 公式情報（管理者が情報元で確認した内容）。カードの「公式情報」に出す。空なら「未確認」 */
  official?: { parking?: string; shuttle?: string; traffic?: string; toilet?: string; food?: string };
  /** 現地情報を投稿した直後に出す共有（サンプル・非公開イベントでは出さない） */
  share?: { eventName: string; base: string; path: string; tags: string[] };
};

const POLL_MS = 20_000;

/**
 * 詳細ページのカード（方針：駐車場・シャトルバス・トイレの3つ。交通規制は駐車場カードの中に1行。飲食・屋台の混雑は運営者の判断で扱わない）。
 * 1カードに「いまの状況（来場者の投稿）」「公式情報」「投稿ボタン」をまとめる。場所が複数あれば1か所1行。
 * always: 公式情報も地点もないときでもカードを出す（「未確認」と分かるように）
 */
const TOPICS = [
  { id: 'parking', title: '駐車場', cats: ['parking'], always: true },
  { id: 'shuttle', title: 'シャトルバス', cats: ['shuttle'], always: false },
  { id: 'toilet', title: 'トイレ', cats: ['toilet'], always: true },
] as const;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export default function EventLive(p: Props) {
  const [reports, setReports] = useState<Report[]>(p.initialReports);
  const [skew] = useState(() => p.serverNow - Date.now()); // 端末時計のずれを補正
  const [now, setNow] = useState(p.serverNow);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState(false);
  // 投稿完了パネル（お礼・投稿内容・共有）
  const [thanks, setThanks] = useState<{ id: number; spotId: number; spot: string; label: string; level: number; at: number } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const catById = useMemo(() => new Map(p.categories.map((c) => [c.id, c])), [p.categories]);
  const visibleSpots = useMemo(() => p.spots.filter((s) => catById.has(s.category_id)), [p.spots, catById]);
  const spotById = useMemo(() => new Map(visibleSpots.map((s) => [s.id, s])), [visibleSpots]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${p.eventId}/live`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { reports: Report[] };
      // サーバー側の短いキャッシュ（10秒）で直前の自分の投稿がまだ含まれない場合も、画面からは消さない
      setReports((prev) => {
        const ids = new Set(data.reports.map((r) => r.id));
        const keep = prev.filter((r) => r.mine && !ids.has(r.id) && Date.now() + skew - r.created_at < 60_000);
        return [...keep, ...data.reports];
      });
    } catch { /* オフライン時は前回の表示を維持 */ }
  }, [p.eventId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + skew), 15_000);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now() + skew); refresh(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(tick); clearInterval(poll); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh, skew]);

  // 投稿ありがとうのパネルは6秒で自動的に閉じ、自分の投稿の場所を光らせる（パネルを触ったら閉じない）
  const [thanksHold, setThanksHold] = useState(false);
  useEffect(() => {
    if (!thanks || thanksHold) return;
    const t = setTimeout(() => { setHighlight(thanks.spotId); setThanks(null); }, 6000);
    return () => clearTimeout(t);
  }, [thanks, thanksHold]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /** 地点ごとの「現在の状況」：1人の投稿で決めず、直近の投稿の多数決（同じ人は1票）。lib/consensus.ts */
  const statusBySpot = useMemo(() => {
    const groups = new Map<number, Report[]>();
    for (const r of reports) (groups.get(r.spot_id) ?? groups.set(r.spot_id, []).get(r.spot_id)!).push({ ...r, who: r.who ?? (r.mine ? 'me' : `r${r.id}`) });
    const m = new Map<number, Consensus<Report>>();
    for (const [id, list] of groups) { const c = consensus(list, now); if (c) m.set(id, c); }
    return m;
  }, [reports, now]);
  const latestBySpot = useMemo(() => new Map([...statusBySpot].map(([id, c]) => [id, c.report])), [statusBySpot]);

  // 公開マップは簡易表示：施設は決まった種類だけ、エリアは四角に簡略化、線は出さない（lib/shapes.ts）
  const mapShapes = useMemo(() => simplifyShapes(p.shapes), [p.shapes]);
  const markers: MapMarker[] = useMemo(() => visibleSpots.filter((s) => !s.generic && PUBLIC_SPOT_CATS.includes(catById.get(s.category_id)?.slug ?? '')).map((s) => {
    const c = catById.get(s.category_id)!;
    const latest = latestBySpot.get(s.id);
    const stale = latest && freshness(latest.created_at, now) === 'stale';
    const border = c.options.length ? levelColor(latest?.level) : c.color;
    const badge = latest && !stale ? `<span class="mk-badge" style="background:${levelColor(latest.level)}">${escapeHtml(latest.label)}</span>` : '';
    return {
      id: s.id, lat: s.lat, lng: s.lng, title: s.name,
      html: `<div class="mk${selected === s.id ? ' selected' : ''}${stale ? ' stale' : ''}${s.source === 'guide' ? ' est' : ''}" style="border-color:${border}">${iconHtml('category', c.slug, c.icon, 18)}${badge}</div>`,
    };
  }), [visibleSpots, catById, latestBySpot, selected, now]);

  async function post(spotId: number, value: string) {
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spotId, value }) });
      const data = await res.json();
      if (data.ok) {
        setReports((rs) => [{ ...data.report, event_id: p.eventId, mine: true, who: rs.find((x) => x.mine)?.who ?? 'me' }, ...rs]);
        setNow(Date.now() + skew);
        setSelected(null);
        const sp = spotById.get(spotId);
        setThanksHold(false);
        setThanks({ id: data.report.id, spotId, spot: sp?.name ?? '', label: data.report.label, level: data.report.level, at: data.report.created_at });
      } else {
        setToast({ msg: data.error ?? '投稿できませんでした', error: true });
      }
    } catch {
      setToast({ msg: '通信エラーが発生しました', error: true });
    } finally {
      setPosting(false);
    }
  }


  const sel = selected != null ? spotById.get(selected) : undefined;
  const selCat = sel ? catById.get(sel.category_id) : undefined;
  const selLatest = sel ? latestBySpot.get(sel.id) : undefined;
  const selPosts = sel ? reports.filter((r) => r.spot_id === sel.id).slice(0, 5) : [];
  const fresh = reports.filter((r) => spotById.has(r.spot_id) && freshness(r.created_at, now) === 'fresh');
  const newest = reports.find((r) => spotById.has(r.spot_id));

  /** 状況のピル（投稿なし・古い情報も同じ見た目で） */
  const pill = (latest: Report | undefined) => latest
    ? <span className={`status-pill ${freshness(latest.created_at, now) === 'stale' ? 'stale' : ''}`} style={{ background: levelColor(latest.level) }}>{latest.label}</span>
    : <span className="status-pill none">投稿なし</span>;
  const when = (s: Spot, latest: Report | undefined) => {
    const c = statusBySpot.get(s.id);
    if (!latest || !c) return '';
    if (c.stale) return `⚠️ ${relTime(latest.created_at, now)}の情報`;
    return `${relTime(latest.created_at, now)}・${consensusNote(c)}`;
  };

  return (
    <section id="live" className="live-cards" style={{ scrollMarginTop: 70 }}>
      <div className="now-sum">
        {!p.postable ? p.postBlockedReason
          : fresh.length ? <><span className="live-dot" />直近{FRESH_MIN}分で来場者から{fresh.length}件の投稿・最終 {relTime(newest!.created_at, now)}</>
          : <>まだ投稿はありません。タップで投稿できます（登録不要）</>}
      </div>

      <div className="status-tiles" role="list" aria-label="いまの状況">
        {TOPICS.map((t) => {
          const spots = visibleSpots.filter((s) => (t.cats as readonly string[]).includes(catById.get(s.category_id)?.slug ?? '') && catById.get(s.category_id)!.options.length > 0);
          if (!spots.length && !p.official?.[t.id]?.trim() && !t.always) return null;
          const cat = p.categories.find((c) => (t.cats as readonly string[]).includes(c.slug));
          // 最新の状況（複数か所なら一番新しく投稿があった場所）
          const best = spots.map((s) => latestBySpot.get(s.id)).filter(Boolean).sort((a, b) => b!.created_at - a!.created_at)[0];
          const stale = best && freshness(best.created_at, now) === 'stale';
          return (
            <a key={t.id} role="listitem" href={`#topic-${t.id}`} className="status-tile" style={{ ['--c' as string]: cat?.color ?? '#64748b' }}>
              <span className="st-icon">{cat && <KindIcon kind="category" slug={cat.slug} emoji={cat.icon} size={20} />}</span>
              <span className="st-name">{t.title}</span>
              {best ? <span className={`st-val ${stale ? 'stale' : ''}`} style={{ background: levelColor(best.level) }}>{best.label}</span>
                : <span className="st-val none">投稿なし</span>}
            </a>
          );
        })}
      </div>

      {TOPICS.map((t) => {
        const spots = visibleSpots.filter((s) => (t.cats as readonly string[]).includes(catById.get(s.category_id)?.slug ?? '') && catById.get(s.category_id)!.options.length > 0);
        const official = p.official?.[t.id]?.trim() ?? '';
        if (!spots.length && !official && !t.always) return null;
        const cat = p.categories.find((c) => (t.cats as readonly string[]).includes(c.slug));
        // 並び：投稿がある場所（新しい順）→ 投稿がない場所（登録順）。多いときは3か所まで出して残りは畳む
        const sorted = [...spots].sort((a, b) => (latestBySpot.get(b.id)?.created_at ?? 0) - (latestBySpot.get(a.id)?.created_at ?? 0) || a.sort - b.sort);
        const open = expanded.has(t.id) || sorted.length <= 4;
        const shown = open ? sorted : sorted.slice(0, 3);
        const single = spots.length === 1 ? spots[0] : undefined;
        const singleLatest = single ? latestBySpot.get(single.id) : undefined;
        return (
          <div key={t.id} className="topic-card colored" id={`topic-${t.id}`} style={{ ['--c' as string]: cat?.color ?? '#64748b', scrollMarginTop: 70 }}>
            <div className="tc-head">
              <span className="tc-icon">{cat && <KindIcon kind="category" slug={cat.slug} emoji={cat.icon} size={20} />}</span>
              <h3>{t.title}</h3>
              {single ? pill(singleLatest) : spots.length > 1 ? <span className="muted small" style={{ fontWeight: 800 }}>{spots.length}か所</span> : null}
            </div>
            {single && singleLatest && (
              <div className={`tc-when ${highlight === single.id ? 'highlight' : ''}`} id={`spot-${single.id}`}>
                現地の投稿・{when(single, singleLatest)}{singleLatest.mine && <span className="mine-tag">あなたの投稿</span>}
              </div>
            )}
            {spots.length > 1 && (
              <div className="tc-rows">
                {shown.map((s) => {
                  const latest = latestBySpot.get(s.id);
                  return (
                    <button key={s.id} id={`spot-${s.id}`} className={`tc-row spot-item ${highlight === s.id ? 'highlight' : ''}`} onClick={() => setSelected(s.id)}>
                      <span className="tc-name"><span className="spot-name">{s.name}</span>
                        <span className="tc-sub">{latest ? when(s, latest) : '投稿なし'}{latest?.mine && <span className="mine-tag">あなたの投稿</span>}</span></span>
                      {latest && pill(latest)}<span className="tc-arrow" aria-hidden>›</span>
                    </button>
                  );
                })}
                {!open && <button className="tc-more" onClick={() => setExpanded((x) => new Set(x).add(t.id))}>ほかの{sorted.length - 3}か所を表示</button>}
              </div>
            )}
            {(() => {
              const traffic = t.id === 'parking' ? p.official?.traffic?.trim() ?? '' : '';
              const long = official.length + traffic.length > 70;
              const body = (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{official || <span className="none">未確認</span>}</div>
                  {traffic && <div className="tc-traffic">🚧 交通規制：{traffic}</div>}
                </>
              );
              return long ? (
                <details className="tc-off">
                  <summary><span className="src-tag official">公式情報</span><span className="tc-off-preview">{official.slice(0, 34)}…</span><span className="tc-off-more">続きを見る</span></summary>
                  {body}
                </details>
              ) : (
                <div className="tc-off"><span className="src-tag official">公式情報</span>{body}</div>
              );
            })()}
            {single && (
              <button className={`tc-btn spot-item ${p.postable ? 'primary' : ''}`} onClick={() => setSelected(single.id)}>
                {t.title}{p.postable ? 'のいまを投稿する' : 'の状況を見る'}
              </button>
            )}
          </div>
        );
      })}

      {!p.simple && (
        <div className="topic-card map-card" id="map" style={{ scrollMarginTop: 70 }}>
          <div className="tc-head"><h3>会場マップ</h3></div>
          <p className="muted small one-line" style={{ margin: '0 0 8px' }}>地点をタップで、状況の確認・投稿ができます</p>
          {p.geo && <LocateButton />}
          <div className="live-map">
            <LeafletMap canvas={p.canvas} geo={p.geo} center={p.center} markers={markers} shapes={mapShapes}
              onMarkerClick={setSelected} focus={sel && !sel.generic ? { lat: sel.lat, lng: sel.lng } : null} locate={p.geo} />
            <div className="legend">
              {['良好', 'やや', '混雑', '非常に', '利用不可'].map((l, i) => <span key={l}><i style={{ background: LEVEL_COLORS[i] }} />{l}</span>)}
              <span><i style={{ background: '#94a3b8' }} />情報なし</span>
              <span>点線＝{FRESH_MIN}分以上前</span>
              {visibleSpots.some((s) => s.source === 'guide') && <span><i className="est-i" />破線の枠＝位置は目安</span>}
            </div>
            {visibleSpots.some((s) => s.source === 'osm') && (
              <div className="muted small one-line" style={{ padding: '0 12px 10px' }}>
                施設の一部：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
              </div>
            )}
          </div>
        </div>
      )}

      {sel && selCat && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelected(null)} />
          <div className="sheet" role="dialog" aria-label={`${sel.name}の状況`}>
            <div className="sheet-grip" />
            <div className="muted small sheet-kind"><KindIcon kind="category" slug={selCat.slug} emoji={selCat.icon} size={15} strokeWidth={2.4} />{selCat.name}</div>
            <h3>{sel.name}</h3>
            {sel.note && <div className="muted small">{sel.note}</div>}
            {p.geo && !sel.generic && (sel.lat || sel.lng) ? (
              <a className="btn ghost go-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat.toFixed(6)}%2C${sel.lng.toFixed(6)}`} target="_blank" rel="noopener noreferrer">
                📍 {sel.source === 'guide' ? 'この辺りに行く' : 'この場所に行く'}（Googleマップ）
              </a>
            ) : null}
            {selCat.options.length > 0 ? (
              <>
                {!p.postable && (
                  <div className="current">
                    現在の状況：
                    {selLatest ? <strong style={{ color: levelColor(selLatest.level) }}>{selLatest.label}</strong> : <span className="muted">現在の情報はありません</span>}
                  </div>
                )}
                {p.postable ? (
                  <>
                    <div className="sheet-ask">あなたが見た、いまの状況は？</div>
                    <p className="muted small" style={{ margin: '-4px 0 8px' }}>ほかの人の投稿ではなく、実際に見た状況を選んでください</p>
                    <div className="option-grid">
                      {selCat.options.map((o) => (
                        <button key={o.value} className="option-btn" disabled={posting}
                          onClick={() => post(sel.id, o.value)}>
                          <span className="lv" style={{ background: levelColor(o.level) }} aria-hidden />{o.label}
                        </button>
                      ))}
                    </div>
                    <p className="muted small" style={{ marginBottom: 0 }}>投稿は匿名で、投稿時刻とともに公開されます。</p>
                    {selLatest && statusBySpot.get(sel.id) && (
                      <p className="muted small current-ref">参考：いまの表示は「{selLatest.label}」（{relTime(selLatest.created_at, now)}・{consensusNote(statusBySpot.get(sel.id)!) || '古い情報'}）</p>
                    )}
                  </>
                ) : <p className="muted small">{p.postBlockedReason}</p>}
                {selPosts.length > 0 && (
                  <div className="sheet-posts">
                    <div className="small" style={{ fontWeight: 800 }}>この場所への最近の投稿</div>
                    {selPosts.map((r) => (
                      <div key={r.id} className={`feed-item ${freshness(r.created_at, now) !== 'fresh' ? 'stale' : ''}`}>
                        <span className="time">{clockTime(r.created_at)}</span>
                        <span className="what"><strong style={{ color: levelColor(r.level) }}>{r.label}</strong>{r.mine && <span className="mine-tag">あなたの投稿</span>}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="muted small">この地点は施設の位置情報のみ掲載しています。</p>}
            <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setSelected(null)}>閉じる</button>
          </div>
        </>
      )}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.msg}</div>}
      {thanks && (() => {
        const s = p.share;
        const lines = [`${p.eventName}の${thanks.spot}、いま「${thanks.label}」です！（${clockTime(thanks.at)}時点）`, 'トイレ・駐車場など現地の最新状況はこちら'];
        const live = (ref: string) => (s ? shareUrl(s.base, s.path, ref) + '#live' : '');
        const d = new Date(thanks.at);
        const whenText = `${d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' })} ${clockTime(thanks.at)}`;
        return (
          <>
            <div className="sheet-backdrop" onClick={() => setThanks(null)} />
            <Confetti key={thanks.id} />
            <div className="sheet thanks" role="dialog" aria-label="投稿ありがとうございます" onPointerDown={() => setThanksHold(true)}>
              <div className="sheet-grip" />
              {!thanksHold && <div className="thanks-timer" aria-hidden />}
              <h3><span className="pop">🎉</span>投稿ありがとうございます！</h3>
              <p className="thanks-lead">あなたの情報がイベント参加者に共有されました。</p>
              <dl className="thanks-detail">
                <div><dt>イベント</dt><dd>{p.eventName}</dd></div>
                <div><dt>投稿内容</dt><dd>{thanks.spot}：<strong style={{ color: levelColor(thanks.level) }}>{thanks.label}</strong></dd></div>
                <div><dt>投稿日時</dt><dd>{whenText}</dd></div>
              </dl>
              <div className="thanks-actions">
                <button className="btn" onClick={() => {
                  setHighlight(thanks.spotId); setThanks(null);
                  setTimeout(() => document.getElementById(`spot-${thanks.spotId}`)?.closest('.topic-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                }}>自分の投稿を見る</button>
                <a className="btn ghost" href="/me">この端末の貢献実績を見る</a>
                <button className="btn ghost" onClick={() => setThanks(null)}>閉じる</button>
              </div>
              {s && (
                <ShareButtons eventId={p.eventId} context="live" compact title="ほかの来場者にも知らせる" url={live('copy_live')}
                  xText={composePost(lines, live('x_live'), s.tags)} lineText={composePost(lines, live('line_live'), s.tags, 1000)} />
              )}
            </div>
          </>
        );
      })()}
    </section>
  );
}

/** クラッカー（投稿ありがとうのときに、左右から紙吹雪がパンと飛ぶ）。動きを減らす設定の端末では出さない */
const CONFETTI_COLORS = ['#e0245e', '#ffd23f', '#3fd2c7', '#7c3aed', '#16a34a', '#2563eb', '#fb923c'];
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => {
    const left = i % 2 === 0; // 左右の2か所から
    const a = ((15 + Math.random() * 55) * Math.PI) / 180; // 真上から内側へ 15〜70°
    const dist = 160 + Math.random() * 220;
    return {
      left, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      x: Math.round((left ? 1 : -1) * Math.sin(a) * dist),
      y: Math.round(-Math.cos(a) * dist),
      r: Math.round(Math.random() * 720 - 360), d: Math.round(Math.random() * 120), w: 6 + Math.round(Math.random() * 6),
    };
  }), []);
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((c, i) => (
        <i key={i} className={c.left ? 'l' : 'r'} style={{
          background: c.color, width: c.w, height: c.w * 1.6, animationDelay: `${c.d}ms`,
          ['--x' as string]: `${c.x}px`, ['--y' as string]: `${c.y}px`, ['--r' as string]: `${c.r}deg`,
        }} />
      ))}
    </div>
  );
}

/** 地図の上の大きな「現在地」ボタン。押したときだけ端末に位置情報の許可を求める（位置は画面に出すだけで、送信・保存しない） */
function LocateButton() {
  const [state, setState] = useState<{ on: boolean; error: string; far: number }>({ on: false, error: '', far: 0 });
  useEffect(() => {
    const h = (e: Event) => setState({ far: 0, ...(e as CustomEvent<{ on: boolean; error: string; far?: number }>).detail } as { on: boolean; error: string; far: number });
    window.addEventListener('evenow:locate-state', h);
    return () => window.removeEventListener('evenow:locate-state', h);
  }, []);
  const km = state.far >= 10_000 ? `${Math.round(state.far / 1000)}km` : `${(state.far / 1000).toFixed(1)}km`;
  return (
    <div className="locate-big">
      <button type="button" className={`tc-btn locate-big-btn ${state.on ? 'on' : ''}`} onClick={() => { setState((s) => ({ ...s, error: '' })); window.dispatchEvent(new Event('evenow:locate')); }}>
        {state.on ? '📍 現在地の表示をやめる' : '📍 自分の位置を地図に表示する'}
      </button>
      {state.on && state.far > 0 ? (
        <div className="locate-far">
          <div className="one-line">いまの場所は会場から<strong>約{km}</strong>。地図は会場付近のままです</div>
          <div>行きたい駐車場などの地点をタップ →「📍 この場所に行く」で、そこまでの道順が出ます</div>
          <div className="locate-far-btns">
            <button type="button" className="chip-btn" onClick={() => window.dispatchEvent(new Event('evenow:show-me'))}>自分の位置を見る</button>
          </div>
        </div>
      ) : <div className="muted small one-line">位置は画面に出すだけで、送信・保存しません</div>}
      {state.error && <div className="locate-err" role="alert">{state.error}</div>}
    </div>
  );
}
