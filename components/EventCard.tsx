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

export default function EventCard({ e }: { e: EventCardT }) {
  // 画像は利用権限が確認できたもののみ登録する前提。無い場合はジャンルの配色で代替表示。
  const style = e.image_url
    ? { backgroundImage: `url(${e.image_url})` }
    : { background: `linear-gradient(135deg, ${e.genre_color}22, ${e.genre_color}55)` };
  return (
    <Link href={`/events/${e.slug}`} className="event-card">
      <div className="thumb" style={style}>
        <div className="badges">
          <span className="badge genre" style={{ background: e.genre_color }}>{e.genre_icon} {e.genre_name}</span>
          <StatusBadges e={e} />
        </div>
        {!e.image_url && <span aria-hidden>{e.genre_icon}</span>}
      </div>
      <div className="body">
        <h3>{e.name}</h3>
        <div className="meta">
          <span>📅 {fmtRange(e.start_date, e.end_date)}</span>
          <span>📍 {e.prefecture} {e.city}・{e.venue_name || '会場情報なし'}</span>
          {e.live_count ? <span style={{ color: '#dc2626', fontWeight: 700 }}>💬 直近1時間の投稿 {e.live_count}件</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function CardList({ events, empty }: { events: EventCardT[]; empty: string }) {
  if (events.length === 0) return <div className="empty">{empty}</div>;
  return <div className="card-list">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>;
}

export function CardRow({ events, empty }: { events: EventCardT[]; empty: string }) {
  if (events.length === 0) return <div className="empty">{empty}</div>;
  return <div className="card-row">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>;
}
