import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'スポンサー・協賛の募集',
  description: 'イベント当日の駐車場・トイレ・シャトルバスの混雑を共有するイベナウ（非公式）のスポンサー・協賛を募集しています。ご相談は無料です。',
};

/**
 * スポンサー・協賛の募集（運営方針：広告は脇役＝ページ下部のみ・「協賛」と明示。数字は実データだけを示し、大きく見せない）。
 * ご相談は無料・いつでも受け付ける。ポイントやクーポンは利用者が増えてから（docs/FUTURE_VISION.md）。
 */
export default function SponsorPage() {
  const contact = `/contact?${new URLSearchParams({ topic: 'スポンサー・協賛のご相談' })}`;
  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 16 }}>
      <h1 className="page-title">スポンサー・協賛の募集</h1>
      <p>{SITE_NAME}（イベナウ）は、イベント当日の<strong>駐車場・トイレ・シャトルバスの混雑</strong>を来場者どうしで共有する、非公式のサービスです。
        「当日の困った」を減らす取り組みに協賛してくださる企業・団体・お店を募集しています。<strong>ご相談は無料</strong>です。</p>

      <section className="section">
        <h2>こんな方に</h2>
        <ul>
          <li>イベント会場の近くのお店・駐車場・ホテル（当日の来場者に知ってもらいたい）</li>
          <li>地域のイベントを応援したい企業・団体</li>
          <li>イベントの安全・快適に関わるサービス（交通・トイレ・防災など）</li>
        </ul>
      </section>

      <section className="section">
        <h2>掲載のしかた</h2>
        <ul>
          <li>イベントページの<strong>下のほう</strong>に、「協賛」と分かる形で掲載します（駐車場・トイレの情報を邪魔しない場所だけです）。</li>
          <li>イベント単位・地域単位など、内容はご相談のうえで決めます。</li>
          <li>掲載できない内容：混雑情報と見分けがつかない広告、来場者の判断を誤らせるもの、公序良俗に反するもの。</li>
        </ul>
      </section>

      <section className="section">
        <h2>お伝えしておくこと</h2>
        <ul>
          <li>イベナウは始まったばかりのサービスです。閲覧数・投稿数などの数字は、<strong>実際の数字だけ</strong>をお伝えします（見込みの数字で大きく見せることはしません）。</li>
          <li>イベナウは非公式のサービスで、各イベントの主催者・会場とは関係がありません。協賛いただいても、主催者の公認にはなりません。</li>
        </ul>
      </section>

      <p style={{ marginTop: 20 }}><Link className="btn" href={contact}>無料で相談する</Link></p>
    </div>
  );
}
