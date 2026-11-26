import type { Metadata } from 'next';
import Link from 'next/link';
import { ALL_BADGES, contributionOf, currentClientId, MIN_VIEWS_TO_SHOW } from '@/lib/contrib';
import { clockTime, levelColor } from '@/lib/freshness';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'この端末の貢献実績', robots: { index: false } };

/**
 * 貢献実績（この端末＝ブラウザの記録）。登録不要で、投稿したブラウザの匿名IDで集計する。
 * 数字は実データのみ。閲覧数は一定数たまるまで表示しない。ポイント・ランキングは扱わない。
 */
export default async function MePage() {
  const cid = await currentClientId();
  const c = cid ? await contributionOf(cid) : null;

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 16 }}>
      <h1 className="page-title" style={{ fontSize: 24 }}>この端末の貢献実績</h1>
      <p className="muted small">
        登録なしで、この端末（ブラウザ）から投稿した情報の記録を表示しています。
        機種変更やブラウザの履歴削除をすると、この記録は見られなくなります。
      </p>

      {!c || c.history.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          まだ投稿がありません。イベント当日、会場のトイレや駐車場の状況を投稿すると、ここに記録されます。
          <div style={{ marginTop: 12 }}><Link className="btn" href="/">イベントを探す</Link></div>
        </div>
      ) : (
        <>
          {c.views >= MIN_VIEWS_TO_SHOW && (
            <div className="panel me-views">あなたの投稿を、これまで<strong>のべ{c.views.toLocaleString()}人</strong>が見ました</div>
          )}
          <div className="me-stats">
            <div><span>累計投稿</span><strong>{c.total}</strong></div>
            <div><span>情報提供したイベント</span><strong>{c.events}</strong></div>
            <div><span>駐車場</span><strong>{c.parking}</strong></div>
            <div><span>トイレ</span><strong>{c.toilet}</strong></div>
            <div><span>シャトルバス</span><strong>{c.shuttle}</strong></div>
          </div>
          <p className="muted small">
            ※ 非表示・通報された投稿や、同じ場所への短時間の重複投稿は数えていません。
            {c.views < MIN_VIEWS_TO_SHOW && ' 閲覧数は、ある程度たまってから表示します。'}
          </p>

          <section className="section">
            <div className="section-head"><h2>称号</h2></div>
            <div className="me-badges">
              {ALL_BADGES.map((b) => {
                const got = c.badges.some((x) => x.key === b.key);
                return (
                  <div key={b.key} className={`me-badge ${got ? 'got' : ''}`}>
                    <strong>{b.name}</strong><span>{got ? '獲得済み' : b.desc}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>投稿履歴</h2></div>
            <div className="me-history">
              {c.history.map((h) => (
                <Link key={h.id} href={`/events/${h.event_slug}#live`} className="me-history-item">
                  <span className="when">{new Date(h.created_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })}<br />{clockTime(h.created_at)}</span>
                  <span className="what">
                    <span className="ev">{h.event_name}</span>
                    <span>{h.spot}：<strong style={{ color: levelColor(h.level) }}>{h.label}</strong></span>
                    <span className="st">{h.status}{h.people > 0 && <>・<strong className="me-people">{h.people.toLocaleString()}人が見ました</strong></>}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
