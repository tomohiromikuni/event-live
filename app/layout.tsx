import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'イベLive｜全国のイベント情報と現地のリアルタイム状況', template: '%s｜イベLive' },
  description: '全国のイベント情報と、来場者が投稿する会場の混雑・待ち時間・駐車場の状況をリアルタイムで共有するサービス',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="logo"><span className="logo-dot" />イベLive</Link>
            <Link href="/search" className="header-link">🔍 探す</Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>イベLiveは各イベントの主催者とは関係のない独立した第三者サービスです。最新・正確な情報は必ず公式サイトでご確認ください。</p>
            <p>現地の状況は来場者による投稿で、内容の正確性は保証されません。</p>
            <p className="muted">地図データ © OpenStreetMap contributors</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
