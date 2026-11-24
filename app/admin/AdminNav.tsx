'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type Item = { href: string; label: string; count?: number; match: (path: string, flagged: boolean) => boolean };

export default function AdminNav({ flags, removals, inquiries, logout }: { flags: number; removals: number; inquiries: number; logout: () => Promise<void> }) {
  const path = usePathname();
  const flagged = useSearchParams().get('flagged') === '1';
  const groups: Item[][] = [
    [
      { href: '/admin', label: 'イベント', match: (p) => p === '/admin' || p.startsWith('/admin/events') },
      { href: '/admin/import', label: '下書きを貼り付け', match: (p) => p.startsWith('/admin/import') },
    ],
    [
      { href: '/admin/reports', label: '投稿', match: (p, f) => p.startsWith('/admin/reports') && !f },
      { href: '/admin/reports?flagged=1', label: '通報', count: flags, match: (p, f) => p.startsWith('/admin/reports') && f },
      { href: '/admin/removals', label: '削除依頼', count: removals, match: (p) => p.startsWith('/admin/removals') },
      { href: '/admin/inquiries', label: '問い合わせ', count: inquiries, match: (p) => p.startsWith('/admin/inquiries') },
      { href: '/admin/sns', label: 'SNS・シェア', match: (p) => p.startsWith('/admin/sns') },
      { href: '/admin/searches', label: '検索ワード', match: (p) => p.startsWith('/admin/searches') },
    ],
    [
      { href: '/admin/settings', label: '設定', match: (p) => p.startsWith('/admin/settings') },
    ],
  ];
  return (
    <nav className="admin-nav" aria-label="管理メニュー">
      <Link href="/admin" className="admin-brand">EVENOW 管理</Link>
      {groups.map((g, i) => (
        <div key={i} className="admin-nav-group">
          {g.map((it) => (
            <Link key={it.href} href={it.href} className={it.match(path, flagged) ? 'on' : undefined} aria-current={it.match(path, flagged) ? 'page' : undefined}>
              {it.label}
              {it.count ? <span className="admin-count">{it.count}</span> : null}
            </Link>
          ))}
        </div>
      ))}
      <div className="admin-nav-foot">
        <a href="/" target="_blank" rel="noopener">公開サイト ↗</a>
        <form action={logout}><button type="submit">ログアウト</button></form>
      </div>
    </nav>
  );
}
