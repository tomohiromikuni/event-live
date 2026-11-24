import Link from 'next/link';
import { fmtRange } from '@/lib/dates';
import type { EventCard } from '@/lib/types';

/**
 * 終了したイベントのページ。会場マップ・現地の投稿・混雑状況は表示しない（古い情報での誤解を防ぐ）。
 * URLは残す：共有リンクや貢献実績の履歴が壊れず、毎年開催のイベントは翌年の日程登録で同じURLのまま復活する。
 * データは管理画面にすべて残る。
 */
export default function EndedEvent({ e }: { e: EventCard }) {
  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 16 }}>
      <div className="event-head ended-head">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span className="badge genre" style={{ background: e.genre_color }}>{e.genre_name}</span>
          <span className="badge ended">終了</span>
        </div>
        <h1>{e.name}</h1>
        <div className="meta">
          <span>{fmtRange(e.start_date, e.end_date)}</span>
          <span>{e.prefecture}{e.city}{e.venue_name ? `・${e.venue_name}` : ''}</span>
        </div>
      </div>
      <div className="panel ended-panel">
        <h2>このイベントは終了しました</h2>
        <p>
          会場マップや当日の混雑状況は、古い情報で誤解が生じないよう、開催期間の終了とともに非公開にしています。
          {e.recurring ? ' 次回の開催日程が確認でき次第、このページで改めてお知らせします。' : ''}
        </p>
        <div className="ended-actions">
          <Link className="btn" href="/">開催中・近日開催のイベントを見る</Link>
          <Link className="btn ghost" href="/search">イベントを探す</Link>
        </div>
      </div>
    </div>
  );
}
