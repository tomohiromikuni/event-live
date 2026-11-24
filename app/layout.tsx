import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { SITE_NAME, SITE_NAME_KANA, UNOFFICIAL } from '@/lib/site';

const TAG = UNOFFICIAL ? '【非公式】' : '';
export const metadata: Metadata = {
  title: { default: `${SITE_NAME}（${SITE_NAME_KANA}）${TAG}｜全国のイベント情報と現地のリアルタイム状況`, template: `%s｜${SITE_NAME}${TAG}` },
  description: `${UNOFFICIAL ? '非公式・' : ''}全国のイベント情報と、来場者が投稿する会場の混雑・待ち時間・駐車場の状況をリアルタイムで共有するサービス`,
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="logo">
              <span className="logo-dot" />{SITE_NAME}<span className="logo-kana">{SITE_NAME_KANA}</span>
              {UNOFFICIAL && <span className="unofficial-tag">非公式</span>}
            </Link>
            <Link href="/search" className="header-link">🔍 探す</Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            {UNOFFICIAL && (
              <p><strong>{SITE_NAME}（{SITE_NAME_KANA}）は非公式のサービスです。</strong>掲載している各イベントの主催者・運営団体・会場とは一切関係がなく、承認や提携も受けていません。</p>
            )}
            <p>最新・正確な情報は必ず各イベントの公式サイトでご確認ください。現地の状況は来場者による投稿で、内容の正確性は保証されません。</p>
            <p><Link href="/about" style={{ textDecoration: 'underline' }}>このサイトについて・掲載内容の訂正/削除のご依頼</Link></p>
            <p className="muted">地図データ © OpenStreetMap contributors</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
