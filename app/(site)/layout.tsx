import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

/** 公開ページ共通のレイアウト（ヘッダー・フッター付き）。管理画面はこのグループの外にある */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
