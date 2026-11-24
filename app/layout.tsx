import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_NAME_KANA, UNOFFICIAL, siteUrl } from '@/lib/site';

const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: `${SITE_NAME}（${SITE_NAME_KANA}）イベントの「今」がわかる。` };
const TAG = UNOFFICIAL ? '【非公式】' : '';
export const metadata: Metadata = {
  title: { default: `${SITE_NAME}（${SITE_NAME_KANA}）${TAG}｜全国のイベント情報と現地のリアルタイム状況`, template: `%s｜${SITE_NAME}${TAG}` },
  description: `${UNOFFICIAL ? '非公式・' : ''}${SITE_DESCRIPTION}`,
  metadataBase: new URL(siteUrl()),
  // SNS 共有用の画像（1200×630）。元データは docs/og-image.html
  openGraph: { siteName: `${SITE_NAME}（${SITE_NAME_KANA}）`, type: 'website', locale: 'ja_JP', images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  // Google Search Console の所有権確認（HTMLタグ方式）。content の値を環境変数に入れる
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } } : {}),
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#fff6e6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
