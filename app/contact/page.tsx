import type { Metadata } from 'next';
import Link from 'next/link';
import ContactForm from '@/components/ContactForm';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'お問い合わせ・掲載停止の申請', robots: { index: false } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string; event?: string }> }) {
  const sp = await searchParams;
  const event = sp.event ? await one<{ slug: string; name: string }>('SELECT slug, name FROM events WHERE slug = $1', [sp.event.slice(0, 120)]) : undefined;
  const kind = sp.type === 'removal' && event ? 'removal' : 'contact';

  return (
    <div className="container" style={{ maxWidth: 640, paddingTop: 16 }}>
      <h1 style={{ fontSize: 20 }}>{kind === 'removal' ? '掲載停止の申請' : '運営へのお問い合わせ'}</h1>
      {kind === 'removal' ? (
        <p className="muted small">
          このイベントの掲載（イベント情報・会場マップ・現地の投稿）の停止を申請できます。内容を確認のうえ、速やかに対応します。
        </p>
      ) : (
        <p className="muted small">
          掲載内容の訂正、掲載してほしいイベント、サイトの不具合などはこちらからお送りください。
          特定のイベントの掲載停止をご希望の場合は、そのイベントのページ下部にある「掲載停止を申請する」からお手続きください。
        </p>
      )}
      <div className="panel"><ContactForm kind={kind} event={kind === 'removal' ? event : undefined} /></div>
      <p className="small" style={{ marginTop: 16 }}><Link href="/about" style={{ textDecoration: 'underline' }}>このサイトについて</Link></p>
    </div>
  );
}
