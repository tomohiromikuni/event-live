import Link from 'next/link';
import { fmtRange, isOngoing } from '@/lib/dates';
import KindIcon from '@/components/Icon';
import { levelColor } from '@/lib/freshness';
import type { EventCard as EventCardT, SpotStatus } from '@/lib/types';

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

/** 地点ごとのいまの状況（トップの大きなカード用） */
function LiveStatusList({ items, now }: { items: SpotStatus[]; now: number }) {
  return (
    <ul className="live-status" aria-label="いまの状況">
      {items.map((st) => {
        const min = Math.max(0, Math.floor((now - Number(st.created_at)) / 60000));
        return (
          <li key={st.spot_id}>
            <KindIcon kind="category" slug={st.cat_slug} emoji={st.cat_icon} size={16} strokeWidth={2.4} />
            <span className="ls-name">{st.spot_name}</span>
            <span className="ls-pill" style={{ background: levelColor(st.level) }}>{st.label}</span>
            <span className="ls-ago">{min < 1 ? 'たった今' : `${min}分前`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function EventCard({ e, hero = false, statuses, now = 0 }: { e: EventCardT; hero?: boolean; statuses?: SpotStatus[]; now?: number }) {
  return (
    <Link href={`/events/${e.slug}`} className={`event-card${hero ? ' hero-card' : ''}`}>
      <div className="thumb" style={thumbStyle(e)}>
        <div className="badges">
          <span className="badge genre" style={{ background: e.genre_color }}><KindIcon kind="genre" slug={e.genre_slug} emoji={e.genre_icon} size={13} strokeWidth={2.6} />{e.genre_name}</span>
          <StatusBadges e={e} />
        </div>
        {!e.image_url && <span className="thumb-icon"><KindIcon kind="genre" slug={e.genre_slug} emoji={e.genre_icon} size={hero ? 64 : 44} strokeWidth={2} /></span>}
      </div>
      <div className="body">
        <h3>{e.name}</h3>
        <div className="meta">
          <span>{fmtRange(e.start_date, e.end_date)}</span>
          <span>{e.prefecture} {e.city}・{e.venue_name || '会場情報なし'}</span>
          {e.live_count ? <span className="live-count">直近1時間で {e.live_count}件の投稿</span> : null}
        </div>
        {statuses && statuses.length > 0 && <LiveStatusList items={statuses} now={now} />}
      </div>
    </Link>
  );
}

/** 行型のコンパクトなカード（トップの「今日開催」など） */
export function EventItem({ e }: { e: EventCardT }) {
  return (
    <Link href={`/events/${e.slug}`} className="event-item">
      <span className="ico" style={thumbStyle(e)} aria-hidden>{!e.image_url && <KindIcon kind="genre" slug={e.genre_slug} emoji={e.genre_icon} size={34} strokeWidth={2.1} />}</span>
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
