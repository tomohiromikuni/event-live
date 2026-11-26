'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import KindIcon from '@/components/Icon';
import { iconHtml } from '@/lib/icons';
import { clockTime, FRESH_MIN, freshness, levelColor, relTime } from '@/lib/freshness';
import { consensus, consensusNote, type Consensus } from '@/lib/consensus';
import { makeT, makeTx, relTimeL, trAuto, trLabel, type Lang, type T } from '@/lib/i18n';
import type { Category, Report, Spot } from '@/lib/types';
import type { MapMarker } from './LeafletMap';
import ShareButtons from './ShareButtons';
import { composePost, shareUrl } from '@/lib/share';
import { distM, fromMeText, nameFromMe, type Geo } from '@/lib/fromMe';
import { PUBLIC_SPOT_CATS, simplifyShapes, type MapShape } from '@/lib/shapes';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="map"><div className="map-fallback">…</div></div>,
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
  /** 表示の言語（英語版は 'en'） */
  lang?: Lang;
  /** 施設名の訳（英語版：日本語の名前 → 英語） */
  spotNames?: Record<string, string>;
  /** 来場者の報告（ピン）の確認人数（spot_id → ある／見つからない／この端末の票） */
  pins?: Record<number, { yes: number; no: number; mine: number }>;
  /** 「概要」タブの中身（開催概要。サーバーで作って渡す） */
  overview?: React.ReactNode;
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

/** 公式の臨時・仮設、来場者の報告の目印（常設の施設と見分けるため） */
function originTag(s: Spot, catSlug: string | undefined, pin?: { yes: number }, t: T = makeT()): { text: string; cls: string } | null {
  if (s.source === 'official_temp') {
    const txt = s.name + s.note;
    if (/仮設/.test(txt) && catSlug === 'toilet') return { text: t('仮設'), cls: 'temp' };
    if (/臨時|特設/.test(txt)) return { text: t('臨時'), cls: 'temp' };
    return { text: t('公式案内'), cls: 'temp official' };
  }
  if (s.source === 'user') return (pin?.yes ?? 1) >= 2 ? { text: t('{n}人が確認', { n: pin!.yes }), cls: 'user ok' } : { text: t('1人の報告'), cls: 'user' };
  return null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export default function EventLive(p: Props) {
  const lang: Lang = p.lang ?? 'ja';
  const t = useMemo(() => makeT(lang), [lang]);
  const rel = (ts: number, n: number) => (lang !== 'ja' ? relTimeL(ts, n, lang) : relTime(ts, n));
  const lab = (l: string) => trLabel(l, lang);
  const nm = (x: string) => trAuto(p.spotNames?.[x] ?? x, lang);
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
  // 来場者の報告（この画面で追加したピンと、確認人数）
  const [addedSpots, setAddedSpots] = useState<Spot[]>([]);
  const [pins, setPins] = useState(p.pins ?? {});
  const visibleSpots = useMemo(() => [...p.spots, ...addedSpots].filter((s) => catById.has(s.category_id)), [p.spots, addedSpots, catById]);
  const spotById = useMemo(() => new Map(visibleSpots.map((s) => [s.id, s])), [visibleSpots]);

  // 現在地（「📍 自分の位置」を押したときだけ。端末の画面の中で距離を計算するだけで、送信・保存しない）
  const [meRaw, setMeRaw] = useState<Geo | null>(null);
  useEffect(() => {
    const onMe = (e: Event) => setMeRaw((e as CustomEvent<Geo | null>).detail);
    window.addEventListener('evenow:me', onMe);
    // 位置情報がすでに許可されていれば、自動で「自分から近い順」にする（許可を求める画面は出さない・地図は会場のまま）
    if (p.geo && !p.simple && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((st) => {
        if (st.state !== 'granted') return;
        const W = window as unknown as { __evenowWantLocate?: boolean; __evenowQuiet?: boolean };
        W.__evenowWantLocate = true; W.__evenowQuiet = true;
        window.dispatchEvent(new Event('evenow:locate'));
      }).catch(() => { /* 使えない端末は会場からの順のまま */ });
    }
    return () => window.removeEventListener('evenow:me', onMe);
  }, []);
  const placed = (s: Spot) => !s.generic && !!(s.lat || s.lng);
  // 会場から遠い（いちばん近い施設まで3km超）ときは「自分から」の表示にしない（会場からの表示のまま）
  const meFar = useMemo(() => {
    if (!meRaw || !p.geo) return false;
    const pts = visibleSpots.filter(placed).map((s) => [s.lat, s.lng] as Geo);
    return pts.length ? Math.min(...pts.map((x) => distM(meRaw, x))) > 3000 : true;
  }, [meRaw, p.geo, visibleSpots]);
  const me = meRaw && p.geo && !meFar ? meRaw : null;
  /** 名前（現在地があれば「（会場から…）」を「（あなたから…）」に） */
  /** 自動の名前「駐車場（会場から北へ約300m）」を、名前「駐車場」と場所「会場から北へ約300m」に分ける（場所は小さく下に出す） */
  const nameParts = (s: Spot): { title: string; place: string } => {
    const full = (me && placed(s) && nameFromMe(s.name, me, [s.lat, s.lng])) || s.name;
    const m = full.match(/^(.+?)（((?:会場|あなた)から[^）]*|あなたのすぐ近く)）$/);
    if (m) return { title: nm(m[1]), place: trAuto(m[2], lang) };
    return { title: nm(s.name), place: fromMe(s) };
  };
  /** 名前に方角が入っていない施設は、説明の行の先頭に「あなたから…」 */
  const fromMe = (s: Spot) => (me && placed(s) && !/（会場から[^）]*）/.test(s.name) ? trAuto(fromMeText(me, [s.lat, s.lng]), lang) : '');
  // 現在地が無いときは会場（地図の中心）から近い順
  const venueAt: Geo | null = p.geo && p.center && (p.center[0] || p.center[1]) ? p.center : null;
  const distOf = (s: Spot) => (!placed(s) ? Infinity : me ? distM(me, [s.lat, s.lng]) : venueAt ? distM(venueAt, [s.lat, s.lng]) : Infinity);

  // タブ：駐車場・（シャトルバス）・トイレ・地図・概要。最初は駐車場（検索でいちばん探される）。#toilet などで開くタブを指定できる
  const spotsOf = useCallback((cats: readonly string[]) => visibleSpots.filter((s) => cats.includes(catById.get(s.category_id)?.slug ?? '') && catById.get(s.category_id)!.options.length > 0), [visibleSpots, catById]);
  const topics = TOPICS.filter((t) => t.always || spotsOf(t.cats).length > 0 || !!p.official?.[t.id]?.trim());
  // 屋台：場所の案内だけ（混雑の投稿は受け付けない＝運営者の判断）。屋台の地点・エリア・公式情報のどれかがあるときだけタブを出す
  const foodSpots = visibleSpots.filter((s) => !s.generic && catById.get(s.category_id)?.slug === 'food');
  const foodAreas = p.shapes.filter((sh) => sh.kind === 'area' && sh.style === 'food');
  const hasFood = foodSpots.length > 0 || foodAreas.length > 0 || !!p.official?.food?.trim();
  const tabIds = [...topics.map((t) => t.id as string), ...(hasFood ? ['food'] : [])];
  const [tab, setTab] = useState<string>(topics[0]?.id ?? 'parking');
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.replace(/^#(topic-)?/, ''));
      if (tabIds.includes(h)) setTab(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function openTab(id: string) {
    setTab(id);
    try { history.replaceState(null, '', `#${id}`); } catch { /* 無視 */ }
    // 下まで読み進めていたら、タブの位置まで戻す（切り替えた中身の先頭が見えるように）
    const el = tabsRef.current;
    if (el) { const top = el.getBoundingClientRect().top + scrollY - 64; if (scrollY > top) scrollTo({ top, behavior: 'smooth' }); }
  }

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
  const tabCats = (tab === 'food' ? ['food'] : TOPICS.find((t) => t.id === tab)?.cats ?? null) as readonly string[] | null;
  // 凡例：いまのタブの投稿の選択肢（色の意味をそのまま見せる）
  const legendOpts = p.categories.find((c) => tabCats?.includes(c.slug) && c.options.length > 0)?.options ?? [];
  const markers: MapMarker[] = useMemo(() => visibleSpots.filter((s) => !s.generic && (PUBLIC_SPOT_CATS.includes(catById.get(s.category_id)?.slug ?? '') || tab === 'food')
    && (!tabCats || tabCats.includes(catById.get(s.category_id)?.slug ?? ''))).map((s) => {
    const c = catById.get(s.category_id)!;
    const latest = latestBySpot.get(s.id);
    const stale = latest && freshness(latest.created_at, now) === 'stale';
    const border = c.options.length ? levelColor(latest?.level) : c.color;
    const badge = latest && !stale ? `<span class="mk-badge" style="background:${levelColor(latest.level)}">${escapeHtml(lab(latest.label))}</span>` : '';
    return {
      id: s.id, lat: s.lat, lng: s.lng, title: nm(s.name),
      html: `<div class="mk${selected === s.id ? ' selected' : ''}${stale ? ' stale' : ''}${s.source === 'guide' ? ' est' : ''}${s.source === 'official_temp' ? ' temp' : ''}${s.source === 'user' ? ` userpin${(pins[s.id]?.yes ?? 1) < 2 ? ' faint' : ''}` : ''}" style="border-color:${border}">${iconHtml('category', c.slug, c.icon, 18)}${badge || (originTag(s, c.slug, pins[s.id], t) ? `<span class="mk-tag ${originTag(s, c.slug, pins[s.id], t)!.cls}">${originTag(s, c.slug, pins[s.id], t)!.text}</span>` : '')}</div>`,
    };
  }), [visibleSpots, catById, latestBySpot, selected, now, tabCats, tab, pins]);

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
        const wait = (data.error ?? '').match(/続けての投稿は(\d+)分あけてください（あと約(\d+)分）/);
        setToast({ msg: wait ? t('続けての投稿は{m}分あけてください（あと約{n}分）', { m: wait[1], n: wait[2] }) : t(data.error ?? '投稿できませんでした'), error: true });
      }
    } catch {
      setToast({ msg: t('通信エラーが発生しました'), error: true });
    } finally {
      setPosting(false);
    }
  }


  // 下から出る画面（地点の投稿・お礼）を開いている間は、後ろのページをスクロールさせない。
  // iPhone の Safari は overflow:hidden だけでは止まらないので、body を固定して、閉じたら元の位置に戻す
  const sheetOpen = selected != null || !!thanks;
  // 下にスワイプして閉じる
  const swipeSel = useSwipeClose(() => setSelected(null));
  const swipeThanks = useSwipeClose(() => setThanks(null));
  useEffect(() => {
    if (!sheetOpen) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow };
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
    return () => {
      Object.assign(b, prev);
      window.scrollTo(0, y);
    };
  }, [sheetOpen]);

  async function votePin(spotId: number, vote: number) {
    try {
      const res = await fetch('/api/pins/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spotId, vote }) });
      const d = await res.json();
      if (d.ok) { setPins((x) => ({ ...x, [spotId]: d.stat })); setToast({ msg: vote === 1 ? t('確認ありがとうございます') : t('「見つからない」を受け付けました') }); }
      else setToast({ msg: t(d.error ?? '送れませんでした'), error: true });
    } catch { setToast({ msg: t('通信エラーが発生しました'), error: true }); }
  }
  async function reportPin(kind: 'toilet' | 'parking') {
    setPinMenu(false);
    if (!('geolocation' in navigator)) { setToast({ msg: t('この端末では現在地を使えません'), error: true }); return; }
    setToast({ msg: t('現在地を確認しています…') });
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch('/api/pins', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: p.eventId, kind, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) });
        const d = await res.json();
        if (!d.ok) { setToast({ msg: t(d.error ?? '報告できませんでした'), error: true }); return; }
        setPins((x) => ({ ...x, [d.spotId]: d.stat }));
        if (d.spot) setAddedSpots((x) => [...x, d.spot as Spot]);
        const cat = p.categories.find((c) => c.slug === kind);
        if (cat && TOPICS.some((t) => t.id === kind)) setTab(kind);
        setToast({ msg: d.merged ? t('すでに報告がある場所でした。確認として受け付けました') : t('報告しました。ほかの人が確認すると、地図にはっきり出ます') });
      } catch { setToast({ msg: t('通信エラーが発生しました'), error: true }); }
    }, (err) => setToast({ msg: err.code === 1 ? '位置情報が許可されていません（上の「自分の位置を地図に表示する」で直し方を表示できます）' : t('現在地を取得できませんでした'), error: true }),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  const [pinMenu, setPinMenu] = useState(false);

  const sel = selected != null ? spotById.get(selected) : undefined;
  const selCat = sel ? catById.get(sel.category_id) : undefined;
  const selLatest = sel ? latestBySpot.get(sel.id) : undefined;
  const selPosts = sel ? reports.filter((r) => r.spot_id === sel.id).slice(0, 5) : [];
  const fresh = reports.filter((r) => spotById.has(r.spot_id) && freshness(r.created_at, now) === 'fresh');
  const newest = reports.find((r) => spotById.has(r.spot_id));

  /** 状況のピル（投稿なし・古い情報も同じ見た目で） */
  const pill = (latest: Report | undefined) => latest
    ? <span className={`status-pill ${freshness(latest.created_at, now) === 'stale' ? 'stale' : ''}`} style={{ background: levelColor(latest.level) }}>{latest.label}</span>
    : <span className="status-pill none">{t('投稿なし')}</span>;
  const when = (s: Spot, latest: Report | undefined) => {
    const c = statusBySpot.get(s.id);
    if (!latest || !c) return '';
    // 何分前かを太字で目立たせる（古い情報はオレンジ＋⚠️）
    if (c.stale) return lang !== 'ja' ? <strong className="ago old">{makeTx(lang)('⚠️ from {t}', { t: rel(latest.created_at, now) })}</strong> : <><strong className="ago old">⚠️ {rel(latest.created_at, now)}</strong>の情報</>;
    return <><strong className="ago">{rel(latest.created_at, now)}</strong>・{consensusNote(c, lang, lab)}</>;
  };

  return (
    <section id="live" className="live-cards" style={{ scrollMarginTop: 70 }}>
      {/* タブの上は1行だけ：「いまの混雑」と、最終更新（または投稿の受付について） */}
      <div className="now-bar">
        <span className="nb-title">{fresh.length ? <span className="live-dot" /> : <span aria-hidden>📡</span>}{t('いまの混雑')}</span>
        <span className="nb-sub one-line">
          {!p.postable ? t(p.postBlockedReason)
            : fresh.length ? t('来場者{n}件・最終 {t}', { n: fresh.length, t: rel(newest!.created_at, now) })
            : t('来場者がタップで共有（登録不要）')}
        </span>
      </div>

      <div className="ev-tabs seg" role="tablist" aria-label={t('表示の切り替え')} ref={tabsRef} style={{ ['--n' as string]: tabIds.length }}>
        {topics.map((tp) => {
          const spots = spotsOf(tp.cats);
          const cat = p.categories.find((c) => (tp.cats as readonly string[]).includes(c.slug));
          // 最新の状況（複数か所なら一番新しく投稿があった場所）
          const best = spots.map((s) => latestBySpot.get(s.id)).filter(Boolean).sort((a, b) => b!.created_at - a!.created_at)[0];
          const stale = best && freshness(best.created_at, now) === 'stale';
          // 地点が複数あるときは「何か所が どの状況か」を数で見せる（1か所の満車で全部が満車に見えないように）
          const fresh = spots.map((s) => latestBySpot.get(s.id)).filter((r): r is Report => !!r && freshness(r.created_at, now) !== 'stale');
          const counts = [...fresh.reduce((m, r) => m.set(r.label, { level: r.level, n: (m.get(r.label)?.n ?? 0) + 1 }), new Map<string, { level: number; n: number }>())]
            .sort((x, y) => x[1].level - y[1].level);
          return (
            <button key={tp.id} type="button" role="tab" aria-selected={tab === tp.id} aria-controls={`topic-${tp.id}`}
              className={`ev-tab ${tab === tp.id ? 'on' : ''}`} style={{ ['--c' as string]: cat?.color ?? '#64748b' }} onClick={() => openTab(tp.id)}>
              <span className="et-head"><span className="et-icon">{cat && <KindIcon kind="category" slug={cat.slug} emoji={cat.icon} size={16} />}</span>
              <span className="et-name">{tp.id === 'shuttle' ? t('バス') : t(tp.title)}</span></span>
              {spots.length > 1 && counts.length > 0 ? (
                <span className="et-val multi">
                  {/* 1種類なら「● 満車 1か所」、2種類以上は色の点と数だけ（「●2 ●1」。色の意味は地図の凡例と同じ） */}
                  {counts.length === 1
                    ? counts.map(([label, c]) => <span key={label} title={lab(label)}><i style={{ background: levelColor(c.level) }} />{lab(label).split(/[・（(]/)[0]} {t('{n}か所', { n: c.n })}</span>)
                    : counts.map(([label, c]) => <span key={label} title={`${lab(label)} ${t('{n}か所', { n: c.n })}`}><i style={{ background: levelColor(c.level) }} />{c.n}</span>)}
                </span>
              ) : best ? <span className={`et-val ${stale ? 'stale' : ''}`} style={{ background: levelColor(best.level) }}>{lab(best.label)}</span>
                : <span className="et-val none">{t('投稿なし')}</span>}
            </button>
          );
        })}
        {hasFood && (
          <button type="button" role="tab" aria-selected={tab === 'food'} aria-controls="topic-food" className={`ev-tab ${tab === 'food' ? 'on' : ''}`} style={{ ['--c' as string]: '#ea580c' }} onClick={() => openTab('food')}>
            <span className="et-head"><span className="et-icon" aria-hidden>🍢</span><span className="et-name">{t('屋台')}</span></span>
            <span className="et-val none">{foodSpots.length + foodAreas.length ? t('{n}か所', { n: foodSpots.length + foodAreas.length }) : t('場所の案内')}</span>
          </button>
        )}
      </div>

      {/* 地図（タブのすぐ下・選んだ種類だけ）。最初はページのスクロールを妨げないよう固定し、地図をタップすると動かせる */}
      {!p.simple && (
        <div className="topic-card map-card map-top" id="map" style={{ scrollMarginTop: 70 }}>
          <div className="live-map">
            <LeafletMap canvas={p.canvas} geo={p.geo} center={p.center} markers={markers} shapes={mapShapes} lockUntilTap
              onMarkerClick={setSelected} focus={sel && !sel.generic ? { lat: sel.lat, lng: sel.lng } : null} locate={p.geo} lang={lang} />
            <div className="legend">
              {/* 色の意味は、いま選んでいるタブの投稿の選択肢そのもの（駐車場なら 空きあり／残りわずか／満車）。1行に収めるため短い言い方 */}
              {legendOpts.map((o) => { const full = lab(o.label); return <span key={o.value} title={full}><i style={{ background: levelColor(o.level) }} />{full.split(/[・（(]/)[0]}</span>; })}
              <span title={t('情報なし')}><i style={{ background: '#94a3b8' }} />{lang === 'ja' ? 'なし' : t('情報なし')}</span>
              <span title={t('点線＝{n}分以上前', { n: FRESH_MIN })}><i className="stale-i" />{lang === 'ja' ? `${FRESH_MIN}分前〜` : t('{n}分以上前', { n: FRESH_MIN })}</span>
              {visibleSpots.some((s) => s.source === 'guide') && <span><i className="est-i" />{t('破線の枠＝位置は目安')}</span>}
            </div>
            {(visibleSpots.some((s) => s.source === 'osm') || p.shapes.some((sh) => sh.style === 'venue')) && (
              <div className="legend-credit">{t('施設・会場の範囲の一部：')}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>
            )}
          </div>
          {p.geo && <LocateNote t={t} />}
          {/* 来場者の場所の報告（地図のすぐ下） */}
          {p.geo && p.postable && (
            <div className="pin-report">
              {!pinMenu ? (
                <button type="button" className="chip-btn" onClick={() => setPinMenu(true)}>{t('＋ ここにトイレ・駐車場がある（現在地で報告）')}</button>
              ) : (
                <div className="pin-menu">
                  <div className="small">{t('いる場所に何がありますか？（位置をこの1回だけ送ります。公式の情報とは分けて表示します）')}</div>
                  <div className="pin-btns">
                    <button type="button" className="chip-btn" onClick={() => reportPin('toilet')}>{t('🚻 トイレ')}</button>
                    <button type="button" className="chip-btn" onClick={() => reportPin('parking')}>{t('🅿️ 駐車場')}</button>
                    <button type="button" className="chip-btn ghost" onClick={() => setPinMenu(false)}>{t('やめる')}</button>
                  </div>
                </div>
              )}
                </div>
              )}
        </div>
      )}

      {TOPICS.map((tp) => {
        const spots = visibleSpots.filter((s) => (tp.cats as readonly string[]).includes(catById.get(s.category_id)?.slug ?? '') && catById.get(s.category_id)!.options.length > 0);
        const official = p.official?.[tp.id]?.trim() ?? '';
        if (!spots.length && !official && !tp.always) return null;
        const cat = p.categories.find((c) => (tp.cats as readonly string[]).includes(c.slug));
        // 並び：投稿がある場所（新しい順）→ 投稿がない場所（登録順）。多いときは3か所まで出して残りは畳む
        // 現在地があれば、自分から近い順（位置が分からないものは最後）
        const sorted = me || venueAt ? [...spots].sort((a, b) => distOf(a) - distOf(b) || a.sort - b.sort)
          : [...spots].sort((a, b) => (latestBySpot.get(b.id)?.created_at ?? 0) - (latestBySpot.get(a.id)?.created_at ?? 0) || a.sort - b.sort);
        const nearestId = me && sorted[0] && placed(sorted[0]) ? sorted[0].id : null;
        const open = expanded.has(tp.id) || sorted.length <= 4;
        const shown = open ? sorted : sorted.slice(0, 3);
        const single = spots.length === 1 ? spots[0] : undefined;
        const singleLatest = single ? latestBySpot.get(single.id) : undefined;
        return (
          <div key={tp.id} className={`topic-card colored ${tab === tp.id ? '' : 'tab-off'}`} role="tabpanel" id={`topic-${tp.id}`} style={{ ['--c' as string]: cat?.color ?? '#64748b', scrollMarginTop: 70 }}>
            <div className="tc-head">
              <span className="tc-icon">{cat && <KindIcon kind="category" slug={cat.slug} emoji={cat.icon} size={20} />}</span>
              <h3>{t(tp.title)}</h3>
              {single ? pill(singleLatest) : spots.length > 1 ? <span className="muted small" style={{ fontWeight: 800 }}>{t('{n}か所', { n: spots.length })}</span> : null}
            </div>
            {single && singleLatest && (
              <div className={`tc-when ${highlight === single.id ? 'highlight' : ''}`} id={`spot-${single.id}`}>
                {t('現地の投稿')}・{when(single, singleLatest)}{singleLatest.mine && <span className="mine-tag">{t('あなたの投稿')}</span>}
              </div>
            )}
            {tp.id === 'toilet' && (() => {
              // 会場まわりのトイレの「多い・少ない」（地図上の数から。仮設・常設を合わせて、来場者の報告は数えない）
              const n = visibleSpots.filter((s) => catById.get(s.category_id)?.slug === 'toilet' && !s.generic && s.source !== 'user').length;
              if (!n || p.simple) return null;
              const level = n >= 9 ? '多め' : n >= 4 ? 'ふつう' : '少なめ';
              return <div className={`tc-amount ${level === '少なめ' ? 'few' : ''}`}>{t('会場まわりのトイレ：')}<strong>{t(level)}</strong>{t('（地図上で{n}か所）', { n })}</div>;
            })()}
            {spots.length > 1 && (me || venueAt) && spots.some(placed) && (
              <div className="near-bar">
                {me ? <span className="near-on">{t('📍 自分から近い順')}</span> : <span className="near-on venue">{t('🚩 会場から近い順')}</span>}
                {!me && meFar && <span className="muted small">{t('会場から離れているので、会場からの方角で表示しています')}</span>}
              </div>
            )}
            {spots.length > 1 && (
              <div className="tc-rows">
                {shown.map((s) => {
                  const latest = latestBySpot.get(s.id);
                  return (
                    <button key={s.id} id={`spot-${s.id}`} className={`tc-row spot-item ${highlight === s.id ? 'highlight' : ''}`} onClick={() => setSelected(s.id)}>
                      <span className="tc-name"><span className="spot-name">{(() => { const tg = originTag(s, catById.get(s.category_id)?.slug, pins[s.id], t); return tg ? <span className={`origin-tag ${tg.cls}`}>{tg.text}</span> : null; })()}{nearestId === s.id && <span className="origin-tag nearest">{t('いちばん近い')}</span>}{nameParts(s).title}</span>
                        <span className="tc-sub">{nameParts(s).place && <>{nameParts(s).place}・</>}{latest ? when(s, latest) : s.source === 'official_temp' ? `${t('投稿なし')}・${t(s.generic ? '地図の位置は未確認' : '位置は目安')}` : s.source === 'osm' && s.note.replace(/・?会場から.+$/, '') ? `${t('投稿なし')}・${trAuto(s.note.replace(/・?会場から.+$/, ''), lang)}` : t('投稿なし')}{latest?.mine && <span className="mine-tag">{t('あなたの投稿')}</span>}</span></span>
                      {latest && pill(latest)}<span className="tc-arrow" aria-hidden>›</span>
                    </button>
                  );
                })}
                {!open && <button className="tc-more" onClick={() => setExpanded((x) => new Set(x).add(tp.id))}>{t('ほかの{n}か所を表示', { n: sorted.length - 3 })}</button>}
              </div>
            )}
            {(() => {
              const traffic = tp.id === 'parking' ? p.official?.traffic?.trim() ?? '' : '';
              if (!official && !traffic) return null; // 公式の案内が無いときは枠ごと出さない
              const long = official.length + traffic.length > 70;
              const body = (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{official || <span className="none">{t('未確認')}</span>}</div>
                  {traffic && <div className="tc-traffic">{t('🚧 交通規制：')}{traffic}</div>}
                </>
              );
              return long ? (
                <details className="tc-off">
                  <summary><span className="src-tag official">{t('公式情報')}</span><span className="tc-off-preview">{official.slice(0, 34)}…</span><span className="tc-off-more">{t('続きを見る')}</span></summary>
                  {body}
                </details>
              ) : (
                <div className="tc-off"><span className="src-tag official">{t('公式情報')}</span>{body}</div>
              );
            })()}
            {single && (
              <button className={`tc-btn spot-item ${p.postable ? 'primary' : ''}`} onClick={() => setSelected(single.id)}>
                {t(p.postable ? '{x}のいまを投稿する' : '{x}の状況を見る', { x: t(tp.title) })}
              </button>
            )}
          </div>
        );
      })}

      {hasFood && (
        <div className={`topic-card colored ${tab === 'food' ? '' : 'tab-off'}`} role="tabpanel" id="topic-food" style={{ ['--c' as string]: '#ea580c', scrollMarginTop: 70 }}>
          <div className="tc-head">
            <span className="tc-icon" aria-hidden>🍢</span>
            <h3>{t('屋台・飲食エリア')}</h3>
            {foodSpots.length + foodAreas.length > 0 && <span className="muted small" style={{ fontWeight: 800 }}>{t('{n}か所', { n: foodSpots.length + foodAreas.length })}</span>}
          </div>
          {foodSpots.length > 0 && (
            <div className="tc-rows">
              {foodSpots.map((s) => (
                <button key={s.id} className="tc-row spot-item" onClick={() => setSelected(s.id)}>
                  <span className="tc-name"><span className="spot-name">{nm(s.name)}</span><span className="tc-sub">{t('場所の案内のみ')}</span></span>
                  <span className="tc-go">{t('地図で見る ›')}</span>
                </button>
              ))}
            </div>
          )}
          {foodAreas.length > 0 && <div className="tc-when">{t('地図のオレンジの範囲が、屋台・飲食エリアです')}</div>}
          {p.official?.food?.trim() && <div className="tc-off"><span className="src-tag official">{t('公式情報')}</span><div style={{ whiteSpace: 'pre-wrap' }}>{p.official.food.trim()}</div></div>}
        </div>
      )}

      {p.overview && (
        <div className="topic-card info-card" id="info" style={{ scrollMarginTop: 70 }}>
          {p.overview}
        </div>
      )}

      {sel && selCat && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelected(null)} />
          <div className="sheet" role="dialog" aria-label={t('{x}の状況', { x: nm(sel.name) })} {...swipeSel}>
            <div className="sheet-grip" />
            {/* 上：地図（施設と現在地が一緒に入る）、その下に名前・説明と丸い「行く」ボタン */}
            {placed(sel) && !p.simple && (
              <div className="sheet-map">
                <LeafletMap key={sel.id} mini canvas={p.canvas} geo={p.geo} center={[sel.lat, sel.lng]} me={me}
                  markers={markers.filter((m) => m.id === sel.id)} shapes={mapShapes.filter((sh) => sh.style === 'venue')} className="map mini-map" lang={lang} />
                {me && <span className="sheet-map-note">{t('青い点があなた')}</span>}
              </div>
            )}
            <div className="sheet-top">
              <div className="sheet-info">
                {/* 種類（駐車場など）。名前が種類と同じ「駐車場」なら重ねて出さず、名前にアイコンを付ける */}
                {nameParts(sel).title !== t(selCat.name) && <div className="muted small sheet-kind"><KindIcon kind="category" slug={selCat.slug} emoji={selCat.icon} size={15} strokeWidth={2.4} />{t(selCat.name)}</div>}
                <h3>{nameParts(sel).title === t(selCat.name) && <KindIcon kind="category" slug={selCat.slug} emoji={selCat.icon} size={20} strokeWidth={2.4} />}{nameParts(sel).title}</h3>
                {(() => {
                  // 場所（会場から・あなたから）と説明は名前の下に小さく
                  const note = sel.note.replace(/・?会場から.+$/, '');
                  const parts = [nameParts(sel).place || (/会場から/.test(sel.note) && !me ? trAuto(sel.note.match(/会場から.+$/)![0], lang) : ''), note && trAuto(note, lang)].filter(Boolean);
                  return parts.length ? <div className="muted small">{parts.join(lang === 'ja' ? '・' : ' · ')}</div> : null;
                })()}
              </div>
              {p.geo && !sel.generic && (sel.lat || sel.lng) ? (
                <a className="go-round" href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat.toFixed(6)}%2C${sel.lng.toFixed(6)}`} target="_blank" rel="noopener noreferrer"
                  aria-label={t(sel.source === 'guide' ? '📍 この辺りへ行く' : '📍 ここへ行く')}>
                  <span className="go-round-i" aria-hidden>
                    {/* 一般的な「道順」の形（Google のロゴは使わない：非公式のため・ブランドの利用ルール） */}
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"><path d="M12 2.5 21.5 12 12 21.5 2.5 12z" fill="currentColor" stroke="none" /><path d="M9 15v-3.5a1.5 1.5 0 0 1 1.5-1.5H15m-2.2-2.3L15 10l-2.2 2.3" stroke="var(--park, #4f46e5)" /></svg>
                  </span><span className="go-round-l">{t('Googleマップ')}</span>
                </a>
              ) : null}
            </div>
            {sel.source === 'user' && (
              <div className="pin-check">
                <div className="small"><strong>{t('来場者の報告')}</strong>{t('（公式の情報ではありません）')}・{(pins[sel.id]?.yes ?? 1) >= 2 ? t('{n}人が「ここにある」と確認', { n: pins[sel.id]!.yes }) : t('まだ1人の報告です')}{(pins[sel.id]?.no ?? 0) > 0 && `・${t('見つからない {n}人', { n: pins[sel.id]!.no })}`}</div>
                {p.postable && (
                  <div className="pin-btns">
                    <button type="button" className={`chip-btn ${pins[sel.id]?.mine === 1 ? 'on' : ''}`} onClick={() => votePin(sel.id, 1)}>{t('✓ ここにある')}</button>
                    <button type="button" className={`chip-btn ${pins[sel.id]?.mine === -1 ? 'on' : ''}`} onClick={() => votePin(sel.id, -1)}>{t('✗ 見つからない')}</button>
                  </div>
                )}
              </div>
            )}
            {selCat.options.length > 0 && selCat.slug !== 'food' ? (
              <>
                {/* いまの状況と「何分前の投稿か」を大きく（古い情報で動かないように、時間をいちばん目立たせる） */}
                {(() => {
                  const c = statusBySpot.get(sel.id);
                  if (!selLatest) return <div className="now-card none">{t('まだ投稿はありません')}</div>;
                  const old = freshness(selLatest.created_at, now) === 'stale';
                  return (
                    <div className={`now-card ${old ? 'old' : ''}`}>
                      <span className="now-pill" style={{ background: old ? '#94a3b8' : levelColor(selLatest.level) }}>{lab(selLatest.label)}</span>
                      <span className="now-ago"><strong>{old && '⚠️ '}{rel(selLatest.created_at, now)}</strong>
                        <small>{old ? t('古い情報') : c ? consensusNote(c, lang, lab) : ''}</small></span>
                    </div>
                  );
                })()}
                {p.postable && <div className="sheet-now"><span>{t('いま見た状況をタップ')}</span></div>}
                {p.postable ? (
                  <>
                    {/* 信号機の帯：色だけで分かるように横一列（緑→オレンジ→赤） */}
                    <div className="option-band" role="group" aria-label={t('あなたが見た、いまの状況は？')}>
                      {selCat.options.map((o) => {
                        const [main, ...rest] = lab(o.label).split(/[・（(]/);
                        const sub = rest.join(' ').replace(/[）)]$/, '');
                        return (
                          <button key={o.value} className="band-btn" disabled={posting} style={{ background: levelColor(o.level) }}
                            onClick={() => post(sel.id, o.value)}>
                            {main}{sub && <small>{sub}</small>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="muted small band-note">{t('実際に見た状況を選んでください・匿名で時刻とともに公開')}</p>
                  </>
                ) : <p className="muted small">{t(p.postBlockedReason)}</p>}
                {selPosts.length > 0 && (
                  <div className="sheet-posts">
                    <div className="small" style={{ fontWeight: 800 }}>{t('この場所への最近の投稿')}</div>
                    {selPosts.map((r) => (
                      <div key={r.id} className={`feed-item ${freshness(r.created_at, now) !== 'fresh' ? 'stale' : ''}`}>
                        <span className="time">{clockTime(r.created_at)}</span>
                        <span className="what"><strong style={{ color: levelColor(r.level) }}>{lab(r.label)}</strong>{r.mine && <span className="mine-tag">{t('あなたの投稿')}</span>}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="muted small">{t(selCat.slug === 'food' ? '屋台・飲食エリアは場所の案内のみです（混雑の投稿は受け付けていません）。' : 'この地点は施設の位置情報のみ掲載しています。')}</p>}
            <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setSelected(null)}>{t('閉じる')}</button>
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
            <div className="sheet thanks" role="dialog" aria-label="投稿ありがとうございます" onPointerDown={() => setThanksHold(true)} {...swipeThanks}>
              <div className="sheet-grip" />
              {!thanksHold && <div className="thanks-timer" aria-hidden />}
              <h3><span className="pop">🎉</span>{t('投稿ありがとうございます！')}</h3>
              <p className="thanks-lead">{t('あなたの情報がイベント参加者に共有されました。')}</p>
              <dl className="thanks-detail">
                <div><dt>{t('イベント')}</dt><dd>{p.eventName}</dd></div>
                <div><dt>{t('投稿内容')}</dt><dd>{nm(thanks.spot)}：<strong style={{ color: levelColor(thanks.level) }}>{lab(thanks.label)}</strong></dd></div>
                <div><dt>{t('投稿日時')}</dt><dd>{whenText}</dd></div>
              </dl>
              <div className="thanks-actions">
                <button className="btn" onClick={() => {
                  setHighlight(thanks.spotId); setThanks(null);
                  setTimeout(() => document.getElementById(`spot-${thanks.spotId}`)?.closest('.topic-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                }}>{t('自分の投稿を見る')}</button>
                <a className="btn ghost" href="/me">{t('この端末の貢献実績を見る')}</a>
                <button className="btn ghost" onClick={() => setThanks(null)}>{t('閉じる')}</button>
              </div>
              {s && (
                <ShareButtons eventId={p.eventId} context="live" compact title={t('この情報をみんなにも（任意）')} url={live('copy_live')}
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

/** 現在地の案内（地図の右上の「📍 現在地」を押したときだけ）：会場から遠いとき・使えないときに1〜2行で知らせる。位置は送信・保存しない */
function LocateNote({ t }: { t: T }) {
  const [state, setState] = useState<{ on: boolean; error: string; far: number }>({ on: false, error: '', far: 0 });
  useEffect(() => {
    const h = (e: Event) => setState({ far: 0, ...(e as CustomEvent<{ on: boolean; error: string; far?: number }>).detail } as { on: boolean; error: string; far: number });
    window.addEventListener('evenow:locate-state', h);
    return () => window.removeEventListener('evenow:locate-state', h);
  }, []);
  const km = state.far >= 10_000 ? `${Math.round(state.far / 1000)}km` : `${(state.far / 1000).toFixed(1)}km`;
  if (state.error) return <div className="locate-err" role="alert">{state.error}</div>;
  if (!(state.on && state.far > 0)) return null;
  return (
    <div className="locate-far">
      <div className="one-line">{t('いまの場所は会場から')}<strong>{t('約{km}', { km })}</strong>{t('。地図は会場付近のままです')}</div>
      <div className="locate-far-btns">
        <button type="button" className="chip-btn" onClick={() => window.dispatchEvent(new Event('evenow:show-me'))}>{t('自分の位置を見る')}</button>
      </div>
    </div>
  );
}

/**
 * 下から出る画面を、下にスワイプして閉じる（いちばん上までスクロールしているときだけ。地図の上の操作は除く）。
 * 指に合わせて画面が下がり、100px 以上か速く下げたら閉じる。
 */
function useSwipeClose(onClose: () => void) {
  const st = useRef<{ y: number; t: number; dy: number; on: boolean } | null>(null);
  return {
    onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
      const el = e.currentTarget;
      if (el.scrollTop > 0 || (e.target as HTMLElement).closest('.leaflet-container')) { st.current = null; return; }
      st.current = { y: e.touches[0].clientY, t: Date.now(), dy: 0, on: false };
    },
    onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
      const s = st.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y;
      if (!s.on && dy < 8) { if (dy < -4) st.current = null; return; } // 上へ動かしたときは中身のスクロール
      s.on = true; s.dy = Math.max(0, dy);
      const el = e.currentTarget;
      el.style.transition = 'none';
      el.style.transform = `translateY(${s.dy}px)`;
    },
    onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
      const s = st.current, el = e.currentTarget;
      st.current = null;
      if (!s?.on) return;
      const fast = s.dy > 40 && s.dy / Math.max(1, Date.now() - s.t) > 0.6;
      el.style.transition = 'transform .18s ease-out';
      if (s.dy > 100 || fast) { el.style.transform = 'translateY(100%)'; setTimeout(onClose, 160); }
      else el.style.transform = '';
    },
  };
}
