import type { Metadata } from 'next';
import Link from 'next/link';
import ContactForm from '@/components/ContactForm';
import { CONTACT_TOPICS } from '@/lib/inquiry';
import { one } from '@/lib/db';
import { redirectedSlug } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'お問い合わせ・掲載停止の申請', robots: { index: false } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string; event?: string; topic?: string }> }) {
  const sp = await searchParams;
  const slug = sp.event?.slice(0, 120);
  const event = slug
    ? await one<{ slug: string; name: string }>('SELECT slug, name FROM events WHERE slug = $1', [slug])
      ?? await redirectedSlug(slug).then((s) => (s ? one<{ slug: string; name: string }>('SELECT slug, name FROM events WHERE slug = $1', [s]) : undefined))
    : undefined;
  // 掲載停止の申請は、イベントが分かっていなくても選べる（その場合はフォームでイベントのページのURLを入れてもらう）
  const kind = sp.type === 'removal' ? 'removal' : 'contact';
  const href = (t: 'contact' | 'removal') => `/contact?${new URLSearchParams({ ...(t === 'removal' ? { type: 'removal' } : {}), ...(event ? { event: event.slug } : {}) })}`;

  return (
    <div className="container" style={{ maxWidth: 640, paddingTop: 16 }}>
      <h1 className="page-title" style={{ fontSize: 24 }}>{kind === 'removal' ? '掲載停止の申請' : '運営へのお問い合わせ'}</h1>
      <nav className="chips" aria-label="お問い合わせの種類" style={{ padding: '0 0 10px' }}>
        <Link className={`chip ${kind === 'contact' ? 'active' : ''}`} href={href('contact')} replace>お問い合わせ・訂正</Link>
        <Link className={`chip ${kind === 'removal' ? 'active' : ''}`} href={href('removal')} replace>掲載停止の申請</Link>
      </nav>
      {kind === 'removal' ? (
        <p className="muted small">
          このイベントの掲載（イベント情報・会場マップ・現地の投稿）の停止を申請できます。内容を確認のうえ、速やかに対応します。
        </p>
      ) : (
        <p className="muted small">
          掲載内容の訂正、掲載してほしいイベント、サイトの不具合などはこちらからお送りください。
          イベントの掲載停止をご希望の場合は、上の<Link href={href('removal')} style={{ textDecoration: 'underline' }}>「掲載停止の申請」</Link>からお手続きください。
        </p>
      )}
      <div className="panel"><ContactForm key={kind} kind={kind} event={event ?? undefined} topic={kind === 'contact' && (CONTACT_TOPICS as readonly string[]).includes(sp.topic ?? '') ? sp.topic : undefined} /></div>
      <p className="small" style={{ marginTop: 16 }}><Link href="/about" style={{ textDecoration: 'underline' }}>このサイトについて</Link></p>
    </div>
  );
}
