import KindIcon from '@/components/Icon';
import { EXPIRE_MIN, clockTime, freshness, levelColor, relTime } from '@/lib/freshness';
import type { Category, EventCard, Report, Spot } from '@/lib/types';

/**
 * 詳細ページの「来場の情報」。検索される言葉（駐車場・シャトルバス・交通規制・トイレ・飲食）ごとに見出しを立て、
 * 「公式情報」（管理者が情報元で確認した内容）と「現地の投稿」（来場者の投稿）をはっきり分けて出す。
 * 投稿はページを開いた時点のもの（最新の状況は上の「現地の状況」が自動で更新される）。
 * 公式情報が無い項目は推測で埋めず「未確認」、投稿が無ければ「現在の投稿情報はありません」。古い投稿は新しく見せない。
 */
export const GUIDE_TOPICS = [
  { id: 'parking', title: '駐車場', field: 'parking_info', cats: ['parking'] },
  { id: 'shuttle', title: 'シャトルバス', field: 'shuttle_info', cats: ['shuttle'] },
  { id: 'traffic', title: '交通規制・周辺道路', field: 'traffic_info', cats: ['traffic'] },
  { id: 'toilet', title: 'トイレ', field: 'toilet_info', cats: ['toilet'] },
  { id: 'food', title: '飲食エリア', field: 'food_info', cats: ['food'] },
] as const;
export const GUIDE_FIELDS: string[] = GUIDE_TOPICS.map((t) => t.field);

type Props = {
  e: EventCard; categories: Category[]; spots: Spot[]; reports: Report[]; now: number;
  /** 投稿を受け付けていない理由（開催前・中止など）。空なら受付中 */
  blocked: string;
};

export default function EventGuide({ e, categories, spots, reports, now, blocked }: Props) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  // 地点ごとの最新の投稿（期限切れ＝90分以上前は「現在の状況」として出さない）
  const latest = new Map<number, Report>();
  for (const r of reports) {
    if (freshness(r.created_at, now) === 'expired') continue;
    const cur = latest.get(r.spot_id);
    if (!cur || r.created_at > cur.created_at) latest.set(r.spot_id, r);
  }

  return (
    <section className="section" id="guide" style={{ scrollMarginTop: 130 }}>
      <div className="section-head"><h2>{e.name}の駐車場・シャトルバス・交通規制・トイレ</h2></div>
      <p className="muted small" style={{ marginTop: -4 }}>
        <span className="src-tag official">公式情報</span>は情報元で確認した内容、<span className="src-tag user">現地の投稿</span>は来場者の投稿です（このページを開いた時点・{clockTime(now)}）。
      </p>
      {GUIDE_TOPICS.map((t) => {
        const official = (e as unknown as Record<string, string>)[t.field]?.trim();
        const topicSpots = spots.filter((s) => (t.cats as readonly string[]).includes(catById.get(s.category_id)?.slug ?? ''));
        const cat = categories.find((c) => (t.cats as readonly string[]).includes(c.slug));
        const posts = topicSpots.map((s) => ({ s, r: latest.get(s.id) })).filter((x) => x.r)
          .sort((a, b) => b.r!.created_at - a.r!.created_at);
        return (
          <div className="guide-block" key={t.id} id={`guide-${t.id}`}>
            <h3>{cat && <KindIcon kind="category" slug={cat.slug} emoji={cat.icon} size={18} strokeWidth={2.4} />}{t.title}</h3>
            <div className="guide-row">
              <span className="src-tag official">公式情報</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{official || <span className="none">未確認</span>}</div>
            </div>
            <div className="guide-row">
              <span className="src-tag user">現地の投稿</span>
              <div>
                {posts.length > 0 ? (
                  <ul className="guide-posts">
                    {posts.map(({ s, r }) => {
                      const stale = freshness(r!.created_at, now) === 'stale';
                      return (
                        <li key={s.id} className={stale ? 'stale' : ''}>
                          <span className="guide-dot" style={{ background: levelColor(r!.level) }} />
                          <span>{s.name}：<strong>{r!.label}</strong></span>
                          <span className="muted small">（{relTime(r!.created_at, now)}・{clockTime(r!.created_at)}{stale ? '・古い可能性があります' : ''}）</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="none">
                    現在の投稿情報はありません
                    {topicSpots.length > 0 && !blocked && <>　<a href="#live">現地から投稿する</a></>}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <p className="muted small">投稿は{EXPIRE_MIN}分を過ぎると「現在の状況」から外れます。公式情報は変更される場合があるため、最新情報は公式サイトでご確認ください。</p>
    </section>
  );
}
