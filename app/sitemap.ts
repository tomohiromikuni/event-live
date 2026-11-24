import type { MetadataRoute } from 'next';
import { q } from '@/lib/db';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** 検索エンジン向けサイトマップ。サンプル（架空）イベントと非公開イベントは含めない。 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const events = await q<{ slug: string; updated_at: number }>(
    'SELECT slug, updated_at FROM events WHERE published = 1 AND is_sample = 0 ORDER BY updated_at DESC LIMIT 45000');
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/search`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: new Date(e.updated_at), changeFrequency: 'hourly' as const, priority: 0.8 })),
  ];
}
