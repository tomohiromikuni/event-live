import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import KindIcon from '@/components/Icon';
import EventLive from '@/components/EventLive';
import { StatusBadges } from '@/components/EventCard';
import { eventCategories, eventShapes, eventSpots, getEventBySlug, listGenres, recentReports, redirectedSlug, searchEvents } from '@/lib/queries';
import { fmtRange, isEnded, isOngoing } from '@/lib/dates';
import EndedEvent from '@/components/EndedEvent';
import { eventDescription, eventTitle } from '@/lib/seo';
import { INFO_FIELDS } from '@/lib/prefectures';
import type { EventCard } from '@/lib/types';
import { UNOFFICIAL, siteUrl } from '@/lib/site';
import ShareBlock from '@/components/ShareBlock';
import MapThumb from '@/components/MapThumb';
import ThemeThumb from '@/components/ThemeThumb';
import { themeFor } from '@/lib/themes';
import ViewBeacon from '@/components/ViewBeacon';
import { eventTag, hashtagsFor, type TagContext } from '@/lib/hashtags';
import { composePost, shareUrl } from '@/lib/share';
import { q } from '@/lib/db';
import { currentClientId, MIN_VIEWS_TO_SHOW, myViewsInEvent, recordViews } from '@/lib/contrib';
import { todayJST, weekendRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await getEventBySlug((await params).slug);
  if (!e) return {};
  if (isEnded(e.end_date)) {
    const title = e.name;
    // 終了したイベント：一度きりのものは検索エンジンから外す。毎年開催のものは翌年に備えてURLの評価を残す
    return {
      title, description: `${e.name}（${fmtRange(e.start_date, e.end_date)}）は終了しました。`,
      alternates: { canonical: `/events/${e.slug}` },
      robots: e.is_sample || !e.published || !e.recurring ? { index: false, follow: true } : undefined,
    };
  }
  // タイトルの末尾には「｜EVENOW【非公式】」が自動で付く（app/layout.tsx）
  const title = eventTitle(e);
  const description = eventDescription(e);
  return {
    title, description,
    alternates: { canonical: `/events/${e.slug}` },
    // イベント画像が無い場合は、イベント名・日付・会場入りの共有画像（app/og/[slug]）を使う
    openGraph: { title, description, type: 'article', url: `/events/${e.slug}`, images: [e.image_url || { url: `/og/${e.slug}`, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [e.image_url || `/og/${e.slug}`] },
    // サンプル（架空）・非公開のイベントは検索エンジンに登録させない
    robots: e.is_sample || !e.published ? { index: false, follow: false } : undefined,
  };
}

/** Google のイベント検索向け構造化データ（schema.org/Event）。事実情報のみを出力し、不明な項目は出さない。 */
/** パンくずリスト（検索結果に「EVENOW › イベント名」と出るための構造化データ） */
function breadcrumbJsonLd(e: EventCard, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'EVENOW', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: e.name, item: url },
    ],
  };
}

function eventJsonLd(e: EventCard, url: string) {
  const status = { canceled: 'https://schema.org/EventCancelled', postponed: 'https://schema.org/EventPostponed' }[e.status as string]
    ?? 'https://schema.org/EventScheduled';
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.name,
    startDate: e.start_date,
    endDate: e.end_date,
    eventStatus: status,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(e.summary ? { description: e.summary } : {}),
    ...(e.image_url ? { image: [e.image_url] } : {}),
    url,
    location: {
      '@type': 'Place',
      name: e.venue_name || `${e.prefecture}${e.city}`,
      address: { '@type': 'PostalAddress', addressRegion: e.prefecture, addressLocality: e.city, ...(e.address ? { streetAddress: e.address } : {}), addressCountry: 'JP' },
      ...(e.lat || e.lng ? { geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lng } } : {}),
    },
    ...(e.organizer ? { organizer: { '@type': 'Organization', name: e.organizer, ...(e.official_url ? { url: e.official_url } : {}) } } : {}),
  };
}

const NONE = <span className="none">情報なし</span>;
/** 開催概要の項目のアイコン（文字を減らして見やすく） */
const INFO_ICON: Record<string, string> = { time_text: '🕒', venue: '📍', access: '🚃', nearest_station: '🚉', ticket_info: '🎫', organizer: '🏢', official_url: '🔗' };
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
/** 上のカード（駐車場・シャトルバス・トイレ／交通規制は駐車場カード内）に出す項目は、開催概要の表には出さない（飲食エリアは扱わない） */
const CARD_FIELDS = ['parking_info', 'shuttle_info', 'traffic_info', 'toilet_info', 'food_info'];

function fieldValue(e: EventCard, key: string): React.ReactNode {
  switch (key) {
    case 'venue':
      return e.venue_name || e.address ? <>{e.venue_name}{e.address && <><br /><span className="muted small">{e.address}</span></>}</> : NONE;
    case 'official_url':
      return e.official_url ? <a href={e.official_url} target="_blank" rel="noopener noreferrer">公式サイトを開く ↗</a> : NONE;
    case 'extra_info':
      return null; // 個別の行として展開
    default: {
      const v = (e as unknown as Record<string, string>)[key];
      return v ? v : NONE; // 取得できない項目は推測で補わず「情報なし」
    }
  }
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const slug = (await params).slug;
  const e = await getEventBySlug(slug);
  if (!e) {
    // URLを変えたイベントの古いURL → いまのURLへ転送（?ref= などはそのまま引き継ぐ）
    const to = await redirectedSlug(slug);
    if (to) {
      const qs = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => typeof v === 'string') as [string, string][]).toString();
      permanentRedirect(`/events/${to}${qs ? `?${qs}` : ''}`);
    }
  }
  if (!e || !e.published) notFound();
  // 終了したイベントは「終了しました」の案内だけ（マップ・投稿・混雑状況は見せない。データは管理画面に残る）
  if (isEnded(e.end_date)) return <EndedEvent e={e} />;
  const cid = await currentClientId();
  if (e.published) await recordViews(e.id).catch(() => {}); // 閲覧数の記録（貢献実績用）
  const [genres, categories, spots, reports, shapes] = await Promise.all([
    listGenres(), eventCategories(e.id, e.genre_id), eventSpots(e.id), recentReports(e.id, cid), eventShapes(e.id),
  ]);
  const genre = genres.find((g) => g.id === e.genre_id)!;
  // 前に投稿した人へ：その投稿が見られた回数（本人にだけ表示・実データのみ・少ないうちは出さない）
  const myViews = cid && !e.is_sample ? await myViewsInEvent(cid, e.id).catch(() => 0) : 0;
  // このページを見た人の数（実データのみ。1人1日1回で数える。少ないうちは出さない）
  const views = await q<{ today: number; total: number }>(`SELECT
      COALESCE(SUM(visitors) FILTER (WHERE day = $2), 0)::int AS today, COALESCE(SUM(visitors), 0)::int AS total
    FROM event_views WHERE event_id = $1`, [e.id, todayJST()]).then((r) => r[0]).catch(() => undefined);
  const nowMs = Date.now();
  // 共有リンク（?ref=x など）から来た訪問を記録（SNSからの流入の目安。個人情報は保存しない）
  const { ref } = await searchParams;
  if (ref && /^[a-z_]{1,20}$/.test(ref) && e.published) {
    await q("INSERT INTO share_events (event_id, action, channel, context, created_at) VALUES ($1, 'visit', $2, $3, $4)",
      [e.id, ref, ref.endsWith('_live') ? 'live' : 'event', Date.now()]);
  }

  // SNS共有の文章（イベント名・日程・場所・URL・ハッシュタグ）
  const base = siteUrl();
  const today = todayJST();
  const [wkStart, wkEnd] = weekendRange(today);
  const tagCtx: TagContext = e.start_date <= today && today <= e.end_date ? 'today'
    : e.start_date <= wkEnd && e.end_date >= wkStart ? 'weekend' : 'default';
  const tags = hashtagsFor({ ...e, genre_slug: genre.slug }, tagCtx);
  const shareLines = [e.name, `📅 ${fmtRange(e.start_date, e.end_date)}`, `📍 ${e.prefecture}${e.city}`, 'トイレ・駐車場の混雑や待ち時間をチェック！'];
  const eventPath = `/events/${e.slug}`;
  const liveTags = hashtagsFor({ ...e, genre_slug: genre.slug }, 'live');
  const talkTag = eventTag(e); // X で会話するときのイベント名のタグ
  const ongoing = isOngoing(e.start_date, e.end_date);
  const postable = e.status === 'scheduled' && ongoing;
  const blocked = e.status === 'canceled' ? 'このイベントは中止のため、投稿を受け付けていません。'
    : e.status === 'postponed' ? 'このイベントは延期のため、投稿を受け付けていません。'
    : !ongoing ? `投稿の受付は開催中（${fmtRange(e.start_date, e.end_date)}）だけです` : '';

  // 駐車場・シャトルバス・交通・トイレ・飲食は「来場の情報」の見出しで出すので、開催概要の表からは外す
  const fieldKeys = (genre.info_fields || INFO_FIELDS.map((f) => f.key).join(',')).split(',').map((s) => s.trim())
    .filter((k) => k && !CARD_FIELDS.includes(k));
  const extras = e.extra_info.split('\n').map((l) => l.split(/[:：]/)).filter((p) => p.length >= 2 && p[0].trim())
    .map(([k, ...v]) => [k.trim(), v.join(':').trim()] as const);

  // 上部：テーマ写真（イベント名・ジャンルから自動）。時間は短いときだけ上に出し、細かい注意は開催概要へ
  const theme = themeFor({ name: e.name, genre_slug: genre.slug });
  const firstTime = (e.time_text || '').split(/[（(]/)[0].trim();
  const shortTime = firstTime.length <= 16 ? firstTime : '';

  // 「概要」タブの中身（開催概要）
  const overview = (
    <>
        <h2 className="info-h">開催概要</h2>
        {e.summary && <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{e.summary}</p>}
        {(() => {
          // 情報のある項目だけをアイコン付きで出し、確認できない項目は1行にまとめる（推測で埋めない）
          const rows: { key: string; icon: string; label: string; value: React.ReactNode }[] = [];
          const missing: string[] = [];
          for (const key of fieldKeys) {
            const def = INFO_FIELDS.find((f) => f.key === key);
            if (!def) continue;
            if (key === 'extra_info') {
              for (const [k, v] of extras) if (v) rows.push({ key: `x-${k}`, icon: '📝', label: k, value: v }); else missing.push(k);
              continue;
            }
            const has = key === 'venue' ? !!(e.venue_name || e.address) : !!(e as unknown as Record<string, string>)[key];
            if (has) rows.push({ key, icon: INFO_ICON[key] ?? '・', label: def.label, value: fieldValue(e, key) });
            else missing.push(def.label);
          }
          rows.push({ key: 'status', icon: e.status === 'scheduled' ? '✅' : '⚠️', label: '開催状況', value: <>{e.status === 'canceled' ? '中止' : e.status === 'postponed' ? '延期' : '開催予定'}{e.status_note && `（${e.status_note}）`}</> });
          return (
            <>
              <ul className="info-icons">
                {rows.map((r) => (
                  <li key={r.key}><span className="ii-icon" aria-hidden="true">{r.icon}</span><span className="ii-label">{r.label}</span><span className="ii-val">{r.value}</span></li>
                ))}
              </ul>
              {missing.length > 0 && <p className="muted small one-line" title={missing.join('・')}>未確認：{missing.join('・')}</p>}
            </>
          );
        })()}
        <p className="muted small one-line">
          情報元：{e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>{hostOf(e.source_url)}</a> : (e.is_sample ? 'サンプルデータ' : '情報なし')}
          {e.source_checked_at && `（${e.source_checked_at.slice(5).replace('-', '/')} 確認）`}
        </p>
    </>
  );

  return (
    <div className="container">
      {e.published ? <ViewBeacon eventId={e.id} /> : null}
      {!e.is_sample && (
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([eventJsonLd(e, `${siteUrl()}/events/${e.slug}`), breadcrumbJsonLd(e, `${siteUrl()}/events/${e.slug}`)]).replace(/</g, '\\u003c') }} />
      )}
      {e.is_sample ? (
        <div className="banner sample"><span className="banner-label">サンプル</span><span>これは動作確認用の<strong>サンプルデータ</strong>です。実在のイベントではありません。</span></div>
      ) : null}
      {e.status === 'canceled' && <div className="banner canceled"><span className="banner-label">中止</span><span><strong>開催中止</strong>　{e.status_note}</span></div>}
      {e.status === 'postponed' && <div className="banner postponed"><span className="banner-label">延期</span><span><strong>延期</strong>　{e.status_note}</span></div>}

      <div className="event-head">
        {/* ページ上部のサムネイル：利用許諾済みの写真があればそれ、無ければジャンルの色とイラストで作る（公式サイトの画像は転載しない） */}
        {e.image_url ? (
          <figure className="event-thumb photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.image_url} alt={`${e.name}の写真`} />
            {e.image_credit && <figcaption>{e.image_credit}</figcaption>}
          </figure>
        ) : theme ? (
          <ThemeThumb theme={theme} mapLink={e.map_mode !== 'simple'} />
        ) : e.map_mode === 'geo' && (e.lat || e.lng) ? (
          <MapThumb center={[e.lat, e.lng]} spots={spots} categories={categories} genre={genre} />
        ) : (
          <div className="event-thumb" style={{ background: genre.color }} aria-hidden>
            <span className="thumb-dot a" /><span className="thumb-dot b" />
            <span className="thumb-icon"><KindIcon kind="genre" slug={genre.slug} emoji={genre.icon} size={64} strokeWidth={2} /></span>
            <span className="thumb-genre">{genre.name}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><StatusBadges e={e} /></div>
        <h1>{e.name}</h1>
        <div className="meta">
          <span>
            <svg aria-label="日時" role="img" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            <span className="one-line">{fmtRange(e.start_date, e.end_date)}{shortTime && `　${shortTime}`}</span>
          </span>
          <span>
            <svg aria-label="場所" role="img" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
            <span className="one-line">{e.city || e.prefecture}・{e.venue_name || '会場情報なし'}</span>
          </span>
          {!e.is_sample && views && views.total >= MIN_VIEWS_TO_SHOW && (
            <span>
              <svg aria-label="閲覧" role="img" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              <span>{views.today > 0 ? `今日${views.today.toLocaleString()}人・` : ''}これまでのべ{views.total.toLocaleString()}人が見ました</span>
            </span>
          )}
        </div>
      </div>

      {myViews >= MIN_VIEWS_TO_SHOW && (
        <a className="my-views" href="/me">
          <span aria-hidden="true">🙌</span>
          <span>このイベントでのあなたの投稿が、これまで<strong>{myViews.toLocaleString()}回</strong>見られました。ありがとうございます！<small>（あなたにだけ表示）</small></span>
        </a>
      )}
      <h2 className="cards-title">駐車場・{e.shuttle_info ? 'シャトルバス・' : ''}トイレの現地の状況</h2>
      <EventLive eventId={e.id} eventName={e.name} canvas={{ w: e.map_w, h: e.map_h }} geo={e.map_mode === 'geo'} simple={e.map_mode === 'simple'} center={e.lat || e.lng ? [e.lat, e.lng] : undefined} categories={categories} spots={spots} shapes={shapes}
        initialReports={reports} serverNow={nowMs} postable={postable} postBlockedReason={blocked}
        official={{ parking: e.parking_info, shuttle: e.shuttle_info, traffic: e.traffic_info, toilet: e.toilet_info, food: e.food_info }}
        share={!e.is_sample && e.published ? { eventName: e.name, base, path: eventPath, tags: liveTags } : undefined}
        overview={overview} />

      {!e.is_sample && e.published && (
        <ShareBlock eventId={e.id} tag={talkTag} url={shareUrl(base, eventPath, 'copy')}
          xText={composePost(shareLines, shareUrl(base, eventPath, 'x'), tags)}
          lineText={composePost(shareLines, shareUrl(base, eventPath, 'line'), tags, 1000)} />
      )}

      {/* 注意書き・連絡先（いちばん下に小さく） */}
      <footer className="page-note">
        {UNOFFICIAL && (
          <p>
            <strong>非公式</strong>ページです。最新の情報は{e.official_url ? <a href={e.official_url} target="_blank" rel="noopener noreferrer">公式サイト</a> : '公式発表'}でご確認ください。
          </p>
        )}
        <p>
          <a href={`/contact?event=${encodeURIComponent(e.slug)}`} rel="nofollow">訂正・お問い合わせ</a>
          {'　・　'}<a href={`/contact?type=removal&event=${encodeURIComponent(e.slug)}`} rel="nofollow">掲載停止の申請</a>
        </p>
      </footer>
    </div>
  );
}
