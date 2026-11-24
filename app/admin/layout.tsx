import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { logout } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '管理画面', robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <nav className="admin-nav">
        <Link href="/admin">📋 イベント</Link>
        <Link href="/admin/events/new">＋ 新規登録</Link>
        <Link href="/admin/import">📥 下書きを貼り付け</Link>
        <Link href="/admin/reports">💬 投稿管理</Link>
        <Link href="/admin/reports?flagged=1">🚩 通報</Link>
        <Link href="/admin/settings">⚙️ ジャンル・カテゴリ設定</Link>
        <form action={logout} className="inline-form"><button className="btn ghost sm">ログアウト</button></form>
      </nav>
      {children}
    </div>
  );
}
