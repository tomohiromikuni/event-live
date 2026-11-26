import { Suspense } from 'react';
import { isAdmin, requireAdmin } from '@/lib/admin';
import { pendingCounts } from '@/lib/admin-data';
import { logout } from './actions';
import AdminNav from './AdminNav';
import Link from 'next/link';
import { discoverSettings, monthSpend } from '@/lib/collect/discover';

export const dynamic = 'force-dynamic';
// 未ログインのときはタイトルにも管理画面と出さない（「ページが見つかりません」と同じ表示にする）
export async function generateMetadata() {
  return { title: (await isAdmin()) ? '管理画面' : 'ページが見つかりません', robots: { index: false, follow: false } };
}

/** 管理画面（自分用）。公開サイトのデザインとは別の、シンプルな見た目にしている */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const counts = await pendingCounts();
  // AIの費用（今月の使用額の目安・上限・残り）をどの画面でも見えるように
  const [{ budgetYen }, spend] = await Promise.all([discoverSettings(), monthSpend()]);
  const left = Math.max(0, budgetYen - spend), pct = budgetYen ? Math.min(100, Math.round((spend / budgetYen) * 100)) : 100;
  return (
    <div className="admin">
      <Suspense fallback={<nav className="admin-nav" />}>
        <AdminNav flags={counts.flags} removals={counts.removals} inquiries={counts.inquiries} candidates={counts.candidates} logout={logout} />
      </Suspense>
      <main className="admin-main">
        <Link href="/admin/collect" className={`ai-budget ${pct >= 90 ? 'warn' : ''}`} title="AIで探す・読み取り・翻訳・ガイドマップの今月の費用の目安。上限を超えるとAIは自動で止まります（設定は「収集した候補」の画面）">
          <span>🤖 AIの費用（今月）<strong>約{Math.round(spend).toLocaleString()}円</strong> ／ 上限 {budgetYen.toLocaleString()}円 ・ 残り <strong>{Math.round(left).toLocaleString()}円</strong></span>
          <span className="ai-bar"><i style={{ width: `${pct}%` }} /></span>
        </Link>
        {children}
      </main>
    </div>
  );
}
