import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import EventLive from '@/components/EventLive';
import { StatusBadges } from '@/components/EventCard';
import { eventCategories, eventSpots, getEventBySlug, listGenres, recentReports } from '@/lib/queries';
import { fmtRange, isOngoing } from '@/lib/dates';
import { INFO_FIELDS } from '@/lib/prefectures';
import type { EventCard } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await getEventBySlug((await params).slug);
  return e ? { title: e.name, description: e.summary.slice(0, 120) } : {};
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

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const e = await getEventBySlug((await params).slug);
  if (!e || !e.published) notFound();
  const [genres, categories, spots, reports] = await Promise.all([
    listGenres(), eventCategories(e.id, e.genre_id), eventSpots(e.id), recentReports(e.id),
  ]);
  const genre = genres.find((g) => g.id === e.genre_id)!;
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
      {e.is_sample ? (
        <div className="banner sample">⚠️ <span>これは動作確認用の<strong>サンプルデータ</strong>です。実在のイベントではありません。</span></div>
      ) : null}
      {e.status === 'canceled' && <div className="banner canceled">🚫 <span><strong>開催中止</strong>　{e.status_note}</span></div>}
      {e.status === 'postponed' && <div className="banner postponed">⏸️ <span><strong>延期</strong>　{e.status_note}</span></div>}

      <div className="event-head">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span className="badge genre" style={{ background: genre.color }}>{genre.icon} {genre.name}</span>
          <StatusBadges e={e} />
        </div>
        <h1>{e.name}</h1>
        <div className="meta">
          <span>📅 {fmtRange(e.start_date, e.end_date)}{e.time_text && `　${e.time_text}`}</span>
          <span>📍 {e.prefecture}{e.city}・{e.venue_name || '会場情報なし'}</span>
        </div>
      </div>

      <nav className="tabs">
        <a href="#live" className="primary">📡 現地の状況</a>
        <a href="#info">📄 イベント情報</a>
      </nav>

      <EventLive eventId={e.id} center={[e.lat, e.lng]} zoom={e.zoom} categories={categories} spots={spots}
        initialReports={reports} serverNow={Date.now()} postable={postable} postBlockedReason={blocked} />

      <section className="section" id="info" style={{ scrollMarginTop: 110 }}>
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
      </section>
    </div>
  );
}
