import Link from 'next/link';
import { BubbleMark, LogoLockup } from '@/components/Logo';
import { SITE_NAME, SITE_NAME_KANA, UNOFFICIAL } from '@/lib/site';

/** 公開サイトのヘッダー（管理画面では使わない） */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="logo">
          <BubbleMark size={34} />{SITE_NAME}<span className="logo-kana">{SITE_NAME_KANA}</span>
          {UNOFFICIAL && <span className="unofficial-tag">非公式</span>}
        </Link>
        <div className="header-actions">
          <Link href="/me" className="header-link header-me" aria-label="この端末の貢献実績">実績</Link>
          <Link href="/search" className="header-link">
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            探す
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 公開サイトのフッター */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-logo"><LogoLockup fontSize={30} /></div>
        {UNOFFICIAL && (
          <p><strong>{SITE_NAME}（{SITE_NAME_KANA}）は非公式のサービスです。</strong>掲載している各イベントの主催者・運営団体・会場とは一切関係がなく、承認や提携も受けていません。</p>
        )}
        <p>最新・正確な情報は必ず各イベントの公式サイトでご確認ください。現地の状況は来場者による投稿で、内容の正確性は保証されません。</p>
        <p>
          <Link href="/about" style={{ textDecoration: 'underline' }}>このサイトについて</Link>
          {'　'}<Link href="/contact" style={{ textDecoration: 'underline' }}>お問い合わせ</Link>
        </p>
      </div>
    </footer>
  );
}
