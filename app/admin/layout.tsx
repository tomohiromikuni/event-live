import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin';
import { pendingCounts } from '@/lib/admin-data';
import { logout } from './actions';
import AdminNav from './AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: '管理画面', robots: { index: false } };

/** 管理画面（自分用）。公開サイトのデザインとは別の、シンプルな見た目にしている */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const counts = await pendingCounts();
  return (
    <div className="admin">
      <Suspense fallback={<nav className="admin-nav" />}>
        <AdminNav flags={counts.flags} inquiries={counts.removals + counts.inquiries} logout={logout} />
      </Suspense>
      <main className="admin-main">{children}</main>
    </div>
  );
}
