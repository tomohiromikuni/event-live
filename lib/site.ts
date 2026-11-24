/**
 * サイト全体の設定。
 * UNOFFICIAL: 主催者と無関係の「非公式」サービスであることをサイト全体に明示する（既定: ON）。
 *   将来、主催者と提携した場合などに環境変数 NEXT_PUBLIC_UNOFFICIAL=0 で表示を外せる。
 */
export const SITE_NAME = 'EVENOW';
export const SITE_NAME_KANA = 'イベナウ';
export const UNOFFICIAL = process.env.NEXT_PUBLIC_UNOFFICIAL !== '0';
/** 掲載内容の訂正・削除依頼の受付先（URL または mailto:）。未設定なら案内文のみ表示 */
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || '';

/**
 * 公開URL（検索エンジン向けの絶対URL・サイトマップに使用）。
 * 独自ドメイン取得後は NEXT_PUBLIC_SITE_URL に設定する。未設定なら Vercel の本番URLを自動で使う。
 */
export function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return u.replace(/\/$/, '');
}

export const SITE_DESCRIPTION = '全国のイベント情報と、来場者が投稿する会場の混雑・待ち時間・駐車場の状況をリアルタイムで共有するサービス';
