import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, UNOFFICIAL } from '@/lib/site';

export const metadata: Metadata = { title: 'このサイトについて' };

import { THEMES } from '@/lib/themes';

export default function About() {
  return (
    <div className="container prose" style={{ maxWidth: 820 }}>
      <h1 className="page-title">このサイトについて</h1>
      {UNOFFICIAL && (
        <div className="banner unofficial">
          <span className="banner-label">非公式</span><span><strong>{SITE_NAME}は非公式のサービスです。</strong>掲載している各イベントの主催者・運営団体・会場・自治体とは一切関係がなく、承認や提携も受けていません。</span>
        </div>
      )}
      <section className="section">
        <h2>サービスの内容</h2>
        <p>全国のイベントの公開情報をまとめ、来場者が会場の混雑・待ち時間・駐車場などの状況を匿名で投稿・共有できるサービスです。</p>
        <ul>
          <li>イベントの基本情報は公開されている情報をもとに掲載しています。情報元と確認日は各ページに記載しています。</li>
          <li>開催日時・中止・入場条件などは変更される場合があります。<strong>必ず公式サイトで最新情報をご確認ください。</strong></li>
          <li>会場マップは独自に作成したもので、公式の案内図ではありません。施設の位置は目安です。</li>
          <li>現地の状況は来場者の投稿で、正確性は保証されません。現地では係員・警備員の指示に従ってください。</li>
          <li>公式マップ・写真・ロゴなどは、権利者の許諾なく掲載しません。</li>
        </ul>
      </section>
      <section className="section">
        <h2>主催者・関係者の方へ</h2>
        <p>掲載内容の誤り、掲載の停止をご希望の場合はご連絡ください。確認のうえ速やかに対応します。</p>
        <p className="small">
          掲載の停止は、各イベントのページ下部にある<strong>「掲載停止を申請する」</strong>からお手続きください。
          訂正やそのほかのご連絡は、お問い合わせフォームからお送りください。
        </p>
        <p><Link className="btn" href="/contact">運営に問い合わせる</Link></p>
      </section>
      <section className="section">
        <h2>投稿について</h2>
        <p>投稿はログイン不要・匿名です。連続投稿の制限や通報の仕組みを設けており、不適切な投稿は削除することがあります。
          IPアドレスはそのまま保存せず、不正対策のために変換した値のみを保存しています。</p>
      </section>
      <section className="section" id="photo-credits" style={{ scrollMarginTop: 70 }}>
        <h2>写真のクレジット</h2>
        <p className="small">イベントのページや一覧の写真は、テーマごとの<strong>イメージ写真</strong>です（実際のイベントの写真ではありません）。
          すべて Wikimedia Commons の写真を、横長・正方形に切り抜いて縮小して使っています。</p>
        <ul className="small credit-list">
          {Object.values(THEMES).map((t) => (
            <li key={t.key}>
              <strong>{t.label}</strong>：{t.credit
                ? <>写真 <a href={t.credit.page} target="_blank" rel="noopener noreferrer">{t.credit.artist}</a>（{t.credit.license}）</>
                : 'パブリックドメイン／CC0（クレジット表記不要）'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
