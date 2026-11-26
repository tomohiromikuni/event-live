import Link from 'next/link';
import LangMenuCloser from '@/components/LangMenuCloser';
import { BubbleMark, LogoLockup } from '@/components/Logo';
import { SITE_NAME, SITE_NAME_KANA, UNOFFICIAL } from '@/lib/site';
import { currentPath, getLang, langPath } from '@/lib/lang';
import { LANG_META, LANGS, lp, makeTx, type Lang } from '@/lib/i18n';

/** 言語の切り替え（押すと5つの言語が出る。同じページの別の言語へ） */
function LangMenu({ lang, path }: { lang: Lang; path: string }) {
  return (
    <details className="lang-menu">
      <summary className="header-link header-lang" aria-label={`Language / 言語（${LANG_META[lang].label}）`} title="Language / 言語">
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
      </summary>
      <div className="lang-list">
        {LANGS.map((l) => (
          <a key={l} href={langPath(path, l)} hrefLang={LANG_META[l].hreflang} lang={LANG_META[l].html} className={l === lang ? 'on' : ''}>{LANG_META[l].label}</a>
        ))}
      </div>
      <LangMenuCloser />
    </details>
  );
}

/** 公開サイトのヘッダー（管理画面では使わない） */
export async function SiteHeader() {
  const lang = await getLang();
  const en = lang !== 'ja';
  const tx = makeTx(lang);
  const path = await currentPath();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href={en ? lp(lang) : '/'} className="logo">
          <BubbleMark size={34} />{SITE_NAME}{!en && <span className="logo-kana">{SITE_NAME_KANA}</span>}
          {UNOFFICIAL && <span className="unofficial-tag">{en ? tx('Unofficial') : '非公式'}</span>}
        </Link>
        <div className="header-actions">
          <LangMenu lang={lang} path={path} />
          <Link href={en ? `${lp(lang)}/search` : '/search'} className="header-link" aria-label={en ? tx('Search') : '探す'}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span className="hl-text">{en ? tx('Search') : '探す'}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 公開サイトのフッター：ロゴ・リンク（2列）・短い注意書き・言語・著作表示 */
export async function SiteFooter() {
  const lang = await getLang();
  const ja = lang === 'ja';
  const tx = makeTx(lang);
  const links: [string, string][] = ja ? [
    ['/about', 'イベナウについて'], ['/contact', 'お問い合わせ'],
    ['/terms', '利用規約'], ['/privacy', 'プライバシーポリシー'],
    ['/me', 'あなたの貢献実績'], ['/sponsor', 'スポンサー募集'],
    ['/about#operator', '運営情報'], ['/about#photo-credits', '写真のクレジット'],
  ] : [
    [`${lp(lang)}/guide`, tx('Tips for events in Japan')], ['/contact', tx('Contact (Japanese)')],
    ['/about#photo-credits', tx('Photo credits')],
  ];
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-logo"><LogoLockup fontSize={24} /></div>
        <nav className="footer-links" aria-label={ja ? 'サイトの案内' : 'Site'}>
          {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <p className="footer-note">
          {ja
            ? <>{UNOFFICIAL && <>{SITE_NAME}は<strong>非公式</strong>のサービスで、各イベントの主催者・会場とは関係ありません。</>}最新の情報は各イベントの公式サイトでご確認ください。現地の状況は来場者の投稿で、正確性は保証されません。</>
            : <><strong>{tx('{site} is an unofficial service.', { site: SITE_NAME })}</strong> {tx('Always check the official website for the latest information. Live status is reported by visitors and is not guaranteed to be accurate. Event information is machine-translated from Japanese.')}</>}
        </p>
        <p className="footer-langs" aria-label="Language">
          <span aria-hidden>🌐</span>{LANGS.map((l) => <a key={l} href={langPath('/', l)} hrefLang={LANG_META[l].hreflang} lang={LANG_META[l].html} className={l === lang ? 'on' : ''}>{LANG_META[l].label}</a>)}
        </p>
        <p className="footer-copy">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
