import Link from 'next/link';
import { fmtRange, isOngoing } from '@/lib/dates';
import type { EventCard as EventCardT } from '@/lib/types';

export function StatusBadges({ e }: { e: EventCardT }) {
  return (
    <>
      {e.is_sample ? <span className="badge sample">サンプル</span> : null}
      {e.status === 'canceled' && <span className="badge canceled">中止</span>}
      {e.status === 'postponed' && <span className="badge postponed">延期</span>}
      {e.status === 'scheduled' && isOngoing(e.start_date, e.end_date) && <span className="badge live">● 開催中</span>}
    </>
  );
}

function thumbStyle(e: EventCardT) {
  // 画像は利用権限が確認できたもののみ登録する前提。無い場合はジャンルの配色で代替表示。
  return e.image_url
    ? { backgroundImage: `url(${e.image_url})` }
    : { background: `linear-gradient(135deg, ${e.genre_color}33, ${e.genre_color}77)` };
}

export default function EventCard({ e, hero = false }: { e: EventCardT; hero?: boolean }) {
  return (
    <Link href={`/events/${e.slug}`} className={`event-card${hero ? ' hero-card' : ''}`}>
      <div className="thumb" style={thumbStyle(e)}>
        <div className="badges">
          <span className="badge genre" style={{ background: e.genre_color }}>{e.genre_icon} {e.genre_name}</span>
          <StatusBadges e={e} />
        </div>
        {!e.image_url && <span aria-hidden>{e.genre_icon}</span>}
      </div>
      <div className="body">
        <h3>{e.name}</h3>
        <div className="meta">
          <span>{fmtRange(e.start_date, e.end_date)}</span>
          <span>{e.prefecture} {e.city}・{e.venue_name || '会場情報なし'}</span>
          {e.live_count ? <span className="live-count">直近1時間で {e.live_count}件の投稿</span> : null}
        </div>
      </div>
    </Link>
  );
}

/** 行型のコンパクトなカード（トップの「今日開催」など） */
export function EventItem({ e }: { e: EventCardT }) {
  return (
    <Link href={`/events/${e.slug}`} className="event-item">
      <span className="ico" style={thumbStyle(e)} aria-hidden>{!e.image_url && e.genre_icon}</span>
      <span className="txt">
        <span className="kicker" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {e.genre_name}<StatusBadges e={e} />
        </span>
        <span className="name">{e.name}</span>
        <span className="sub">{fmtRange(e.start_date, e.end_date)}・{e.prefecture} {e.city}</span>
        {e.live_count ? <span className="sub live-count">直近1時間で {e.live_count}件の投稿</span> : null}
      </span>
    </Link>
  );
}

export function ItemList({ events, empty }: { events: EventCardT[]; empty: string }) {
  if (events.length === 0) return <div className="empty">{empty}</div>;
  return <div className="event-list">{events.map((e) => <EventItem key={e.id} e={e} />)}</div>;
}

export function CardList({ events, empty }: { events: EventCardT[]; empty: string }) {
  if (events.length === 0) return <div className="empty">{empty}</div>;
  return <div className="card-list">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>;
}

export function CardRow({ events, empty }: { events: EventCardT[]; empty: string }) {
  if (events.length === 0) return <div className="empty">{empty}</div>;
  return <div className="card-row">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>;
}
