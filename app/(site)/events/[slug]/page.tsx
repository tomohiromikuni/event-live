import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import KindIcon from '@/components/Icon';
import EventLive from '@/components/EventLive';
import { StatusBadges } from '@/components/EventCard';
import { eventCategories, eventShapes, eventSpots, getEventBySlug, listGenres, recentReports, redirectedSlug, searchEvents } from '@/lib/queries';
import { fmtRange, isEnded, isOngoing } from '@/lib/dates';
import EndedEvent from '@/components/EndedEvent';
import { ItemList } from '@/components/EventCard';
import { eventDescription, eventTitle } from '@/lib/seo';
import { INFO_FIELDS } from '@/lib/prefectures';
import type { EventCard } from '@/lib/types';
import { UNOFFICIAL, siteUrl } from '@/lib/site';
import ShareButtons from '@/components/ShareButtons';
import ViewBeacon from '@/components/ViewBeacon';
import { hashtagsFor, type TagContext } from '@/lib/hashtags';
import { composePost, shareUrl } from '@/lib/share';
import { q } from '@/lib/db';
import { currentClientId, MIN_VIEWS_TO_SHOW, recordViews } from '@/lib/contrib';
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
/** 上のカード（駐車場・シャトルバス・トイレ・飲食／交通規制は駐車場カード内）に出す項目は、開催概要の表には出さない */
const CARD_FIELDS = ['parking_info', 'shuttle_info', 'traffic_info', 'toilet_info', 'food_info'];

function fieldValue(e: EventCard, key: string): React.ReactNode {
  switch (key) {
    case 'venue':
      return e.venue_name || e.address ? <>{e.venue_name}{e.address && <><br /><span className="muted small">{e.address}</span></>}</> : NONE;
    case 'official_url':
      return e.official_url ? <a href={e.official_url} target="_blank" rel="noopener noreferrer">{e.official_url}</a> : NONE;
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
  // このページを見た人の数（実データのみ。1人1日1回で数える。少ないうちは出さない）
  const views = await q<{ today: number; total: number }>(`SELECT
      COALESCE(SUM(visitors) FILTER (WHERE day = $2), 0)::int AS today, COALESCE(SUM(visitors), 0)::int AS total
    FROM event_views WHERE event_id = $1`, [e.id, todayJST()]).then((r) => r[0]).catch(() => undefined);
  const nowMs = Date.now();
  // 関連イベント（内部リンク）：同じ都道府県 → 足りなければ同じジャンル。開催中・これからのものだけ。サンプルは実イベントに混ぜない
  const pickRelated = (list: EventCard[]) => list.filter((x) => x.id !== e.id && (!!x.is_sample === !!e.is_sample));
  let related = pickRelated(await searchEvents({ pref: e.prefecture, limit: 8 }));
  if (related.length < 4) {
    const more = pickRelated(await searchEvents({ genre: genre.slug, limit: 8 })).filter((x) => !related.some((r) => r.id === x.id));
    related = [...related, ...more];
  }
  related = related.slice(0, 4);

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
  const ongoing = isOngoing(e.start_date, e.end_date);
  const postable = e.status === 'scheduled' && ongoing;
  const blocked = e.status === 'canceled' ? 'このイベントは中止のため、投稿を受け付けていません。'
    : e.status === 'postponed' ? 'このイベントは延期のため、投稿を受け付けていません。'
    : !ongoing ? `現地情報の投稿は開催期間中（${fmtRange(e.start_date, e.end_date)}）に受け付けます。施設の位置は事前に確認できます。` : '';

  // 駐車場・シャトルバス・交通・トイレ・飲食は「来場の情報」の見出しで出すので、開催概要の表からは外す
  const fieldKeys = (genre.info_fields || INFO_FIELDS.map((f) => f.key).join(',')).split(',').map((s) => s.trim())
    .filter((k) => k && !CARD_FIELDS.includes(k));
  const extras = e.extra_info.split('\n').map((l) => l.split(/[:：]/)).filter((p) => p.length >= 2 && p[0].trim())
    .map(([k, ...v]) => [k.trim(), v.join(':').trim()] as const);

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
            <span>{fmtRange(e.start_date, e.end_date)}{e.time_text && `　${e.time_text}`}</span>
          </span>
          <span>
            <svg aria-label="場所" role="img" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
            <span>{e.prefecture}{e.city}・{e.venue_name || '会場情報なし'}</span>
          </span>
          {!e.is_sample && views && views.total >= MIN_VIEWS_TO_SHOW && (
            <span>
              <svg aria-label="閲覧" role="img" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              <span>{views.today > 0 ? `今日${views.today.toLocaleString()}人・` : ''}これまでのべ{views.total.toLocaleString()}人が見ました</span>
            </span>
          )}
        </div>
      </div>

      <h2 className="cards-title">{e.name}の駐車場・{e.shuttle_info ? 'シャトルバス・' : ''}トイレ（現地の状況）</h2>
      <EventLive eventId={e.id} eventName={e.name} canvas={{ w: e.map_w, h: e.map_h }} geo={e.map_mode === 'geo'} simple={e.map_mode === 'simple'} center={e.lat || e.lng ? [e.lat, e.lng] : undefined} categories={categories} spots={spots} shapes={shapes}
        initialReports={reports} serverNow={nowMs} postable={postable} postBlockedReason={blocked}
        official={{ parking: e.parking_info, shuttle: e.shuttle_info, traffic: e.traffic_info, toilet: e.toilet_info, food: e.food_info }}
        share={!e.is_sample && e.published ? { eventName: e.name, base, path: eventPath, tags: liveTags } : undefined} />

      <section className="section" id="info" style={{ scrollMarginTop: 70 }}>
        <div className="section-head"><h2>開催概要</h2></div>
        <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{e.summary || '概要の情報はありません'}</p>
        <dl className="info-table" style={{ margin: 0 }}>
          {fieldKeys.map((key) => {
            const def = INFO_FIELDS.find((f) => f.key === key);
            if (!def) return null;
            if (key === 'extra_info') {
              return extras.map(([k, v]) => (
                <div className="row" key={`x-${k}`}><dt>{k}</dt><dd>{v || NONE}</dd></div>
              ));
            }
            return <div className="row" key={key}><dt>{def.label}</dt><dd>{fieldValue(e, key)}</dd></div>;
          })}
          <div className="row"><dt>開催状況</dt><dd>{e.status === 'canceled' ? '中止' : e.status === 'postponed' ? '延期' : '開催予定'}{e.status_note && `（${e.status_note}）`}</dd></div>
        </dl>
        <p className="muted small">
          情報元：{e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>{e.source_url}</a> : (e.is_sample ? 'サンプルデータ' : '情報なし')}
          {e.source_checked_at && `（${e.source_checked_at} 確認）`}<br />
          掲載情報は変更される場合があります。最新情報は必ず公式サイトでご確認ください。
        </p>
        {!e.is_sample && e.published ? (
          <ShareButtons eventId={e.id} title="このイベントを共有" url={shareUrl(base, eventPath, 'copy')}
            xText={composePost(shareLines, shareUrl(base, eventPath, 'x'), tags)}
            lineText={composePost(shareLines, shareUrl(base, eventPath, 'line'), tags, 1000)} />
        ) : null}
        {UNOFFICIAL && (
          <p className="muted small">
            このページは<strong>非公式</strong>の情報ページです。{e.organizer ? `「${e.organizer}」` : '主催者'}とは関係ありません。
            正確な情報は{e.official_url ? <a href={e.official_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>公式サイト</a> : '公式発表'}でご確認ください。
          </p>
        )}
        <p className="small">
          主催者・関係者の方へ：<a href={`/contact?type=removal&event=${encodeURIComponent(e.slug)}`} style={{ textDecoration: 'underline' }} rel="nofollow">このイベントの掲載停止を申請する</a>
          {'　'}<a href={`/contact?event=${encodeURIComponent(e.slug)}`} style={{ textDecoration: 'underline' }} rel="nofollow">内容の訂正・お問い合わせ</a>
        </p>
      </section>

      {related.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>ほかのイベント（{e.prefecture}・{genre.name}）</h2></div>
          <ItemList events={related} empty="" />
        </section>
      )}
    </div>
  );
}
