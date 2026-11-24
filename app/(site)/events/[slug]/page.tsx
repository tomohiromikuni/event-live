import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import KindIcon from '@/components/Icon';
import EventLive from '@/components/EventLive';
import { StatusBadges } from '@/components/EventCard';
import { eventCategories, eventShapes, eventSpots, getEventBySlug, listGenres, recentReports } from '@/lib/queries';
import { fmtRange, isEnded, isOngoing } from '@/lib/dates';
import EndedEvent from '@/components/EndedEvent';
import { INFO_FIELDS } from '@/lib/prefectures';
import type { EventCard } from '@/lib/types';
import { UNOFFICIAL, siteUrl } from '@/lib/site';
import ShareButtons from '@/components/ShareButtons';
import ViewBeacon from '@/components/ViewBeacon';
import { hashtagsFor, type TagContext } from '@/lib/hashtags';
import { composePost, shareUrl } from '@/lib/share';
import { q } from '@/lib/db';
import { currentClientId, recordViews } from '@/lib/contrib';
import { todayJST, weekendRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await getEventBySlug((await params).slug);
  if (!e) return {};
  const title = UNOFFICIAL ? `${e.name}（非公式情報）` : e.name;
  if (isEnded(e.end_date)) {
    // 終了したイベント：一度きりのものは検索エンジンから外す。毎年開催のものは翌年に備えてURLの評価を残す
    return {
      title, description: `${e.name}（${fmtRange(e.start_date, e.end_date)}）は終了しました。`,
      alternates: { canonical: `/events/${e.slug}` },
      robots: e.is_sample || !e.published || !e.recurring ? { index: false, follow: true } : undefined,
    };
  }
  const description = `${fmtRange(e.start_date, e.end_date)}・${e.prefecture}${e.city}${e.venue_name ? `「${e.venue_name}」` : ''}で開催。`
    + `会場マップ、トイレ・駐車場・屋台の混雑や待ち時間を来場者がリアルタイムで共有。${e.summary}`.slice(0, 110);
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
  const e = await getEventBySlug((await params).slug);
  if (!e || !e.published) notFound();
  // 終了したイベントは「終了しました」の案内だけ（マップ・投稿・混雑状況は見せない。データは管理画面に残る）
  if (isEnded(e.end_date)) return <EndedEvent e={e} />;
  const cid = await currentClientId();
  if (e.published) await recordViews(e.id).catch(() => {}); // 閲覧数の記録（貢献実績用）
  const [genres, categories, spots, reports, shapes] = await Promise.all([
    listGenres(), eventCategories(e.id, e.genre_id), eventSpots(e.id), recentReports(e.id, cid), eventShapes(e.id),
  ]);
  const genre = genres.find((g) => g.id === e.genre_id)!;

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

  const fieldKeys = (genre.info_fields || INFO_FIELDS.map((f) => f.key).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const extras = e.extra_info.split('\n').map((l) => l.split(/[:：]/)).filter((p) => p.length >= 2 && p[0].trim())
    .map(([k, ...v]) => [k.trim(), v.join(':').trim()] as const);

  return (
    <div className="container">
      {e.published ? <ViewBeacon eventId={e.id} /> : null}
      {!e.is_sample && (
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(e, `${siteUrl()}/events/${e.slug}`)).replace(/</g, '\\u003c') }} />
      )}
      {e.is_sample ? (
        <div className="banner sample"><span className="banner-label">サンプル</span><span>これは動作確認用の<strong>サンプルデータ</strong>です。実在のイベントではありません。</span></div>
      ) : null}
      {UNOFFICIAL && (
        <div className="banner unofficial">
          <span className="banner-label">非公式</span><span>このページは<strong>非公式</strong>の情報ページです。{e.organizer ? `「${e.organizer}」` : '主催者'}とは関係ありません。
            正確な情報は{e.official_url ? <a href={e.official_url} target="_blank" rel="noopener noreferrer">公式サイト</a> : '公式発表'}でご確認ください。</span>
        </div>
      )}
      {e.status === 'canceled' && <div className="banner canceled"><span className="banner-label">中止</span><span><strong>開催中止</strong>　{e.status_note}</span></div>}
      {e.status === 'postponed' && <div className="banner postponed"><span className="banner-label">延期</span><span><strong>延期</strong>　{e.status_note}</span></div>}

      <div className="event-head">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span className="badge genre" style={{ background: genre.color }}><KindIcon kind="genre" slug={genre.slug} emoji={genre.icon} size={13} strokeWidth={2.6} />{genre.name}</span>
          <StatusBadges e={e} />
        </div>
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
        </div>
      </div>

      {!e.is_sample && e.published ? (
        <ShareButtons eventId={e.id} title="このイベントを共有" url={shareUrl(base, eventPath, 'copy')}
          xText={composePost(shareLines, shareUrl(base, eventPath, 'x'), tags)}
          lineText={composePost(shareLines, shareUrl(base, eventPath, 'line'), tags, 1000)} />
      ) : null}

      <nav className="tabs">
        <a href="#live" className="primary">現地の状況</a>
        <a href="#info">イベント情報</a>
      </nav>

      <EventLive eventId={e.id} eventName={e.name} canvas={{ w: e.map_w, h: e.map_h }} geo={e.map_mode === 'geo'} center={e.lat || e.lng ? [e.lat, e.lng] : undefined} categories={categories} spots={spots} shapes={shapes}
        initialReports={reports} serverNow={Date.now()} postable={postable} postBlockedReason={blocked}
        share={!e.is_sample && e.published ? { eventName: e.name, base, path: eventPath, tags: liveTags } : undefined} />

      <section className="section" id="info" style={{ scrollMarginTop: 130 }}>
        <div className="section-head"><h2>イベント情報</h2></div>
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
        <p className="small">
          主催者・関係者の方へ：<a href={`/contact?type=removal&event=${encodeURIComponent(e.slug)}`} style={{ textDecoration: 'underline' }} rel="nofollow">このイベントの掲載停止を申請する</a>
          {'　'}<a href="/contact" style={{ textDecoration: 'underline' }} rel="nofollow">内容の訂正・お問い合わせ</a>
        </p>
      </section>
    </div>
  );
}
