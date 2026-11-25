'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type Item = { href: string; label: string; count?: number; match: (path: string, flagged: boolean) => boolean };

export default function AdminNav({ flags, removals, inquiries, candidates = 0, logout }: { flags: number; removals: number; inquiries: number; candidates?: number; logout: () => Promise<void> }) {
  const path = usePathname();
  const flagged = useSearchParams().get('flagged') === '1';
  // 普段使うものだけを上に。たまにしか使わないものは「その他」にまとめる（いま開いているページがあれば開いた状態）
  const main: Item[] = [
    { href: '/admin/analytics', label: 'アナリティクス', match: (p) => p.startsWith('/admin/analytics') },
    { href: '/admin', label: 'イベント', match: (p) => p === '/admin' || p.startsWith('/admin/events') },
    { href: '/admin/candidates', label: '収集した候補', count: candidates, match: (p) => p.startsWith('/admin/candidates') },
    { href: '/admin/removals', label: '削除依頼', count: removals, match: (p) => p.startsWith('/admin/removals') },
    { href: '/admin/inquiries', label: '問い合わせ', count: inquiries, match: (p) => p.startsWith('/admin/inquiries') },
    { href: '/admin/reports', label: '投稿', match: (p) => p.startsWith('/admin/reports') },
    { href: '/admin/sns/x', label: 'X投稿', match: (p) => p.startsWith('/admin/sns/x') },
  ];
  const more: Item[] = [
    { href: '/admin/collect', label: '自動収集', match: (p) => p.startsWith('/admin/collect') },
    { href: '/admin/sources', label: '情報源', match: (p) => p.startsWith('/admin/sources') },
    { href: '/admin/import', label: '下書きを貼り付け', match: (p) => p.startsWith('/admin/import') },
    { href: '/admin/sns', label: 'SNS・シェア', match: (p) => p === '/admin/sns' },
    { href: '/admin/searches', label: '検索ワード', match: (p) => p.startsWith('/admin/searches') },
    { href: '/admin/settings', label: '設定', match: (p) => p.startsWith('/admin/settings') },
  ];
  const link = (it: Item) => (
    <Link key={it.href} href={it.href} className={it.match(path, flagged) ? 'on' : undefined} aria-current={it.match(path, flagged) ? 'page' : undefined}>
      {it.label}
      {it.count ? <span className="admin-count">{it.count}</span> : null}
    </Link>
  );
  return (
    <nav className="admin-nav" aria-label="管理メニュー">
      <Link href="/admin" className="admin-brand">EVENOW 管理</Link>
      <div className="admin-nav-group">{main.map(link)}</div>
      <details className="admin-nav-more" open={more.some((it) => it.match(path, flagged)) || undefined}>
        <summary>その他</summary>
        <div className="admin-nav-group">{more.map(link)}</div>
      </details>
      <div className="admin-nav-foot">
        <a href="/" target="_blank" rel="noopener">公開サイト ↗</a>
        <form action={logout}><button type="submit">ログアウト</button></form>
      </div>
    </nav>
  );
}
