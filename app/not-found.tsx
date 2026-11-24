import Link from 'next/link';
import { BubbleMark } from '@/components/Logo';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
export default function NotFound() {
  // 見つからないページはルートのレイアウトで表示されるため、ヘッダー・フッターをここで付ける
  return (
    <>
    <SiteHeader />
    <main className="container nf">
      <div className="nf-code" aria-hidden><BubbleMark size={72} />404</div>
      <h1>ページが見つかりません</h1>
      <p>URLが変わったか、掲載が終了した可能性があります。</p>
      <div className="nf-actions">
        <Link className="btn" href="/">トップへ戻る</Link>
        <Link className="btn ghost" href="/search">イベントを探す</Link>
      </div>
    </main>
    <SiteFooter />
    </>
  );
}
