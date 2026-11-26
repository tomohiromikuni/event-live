import type { MetadataRoute } from 'next';
import { q } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import { todayJST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** 検索エンジン向けサイトマップ。サンプル（架空）イベントと非公開イベントは含めない。 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const events = await q<{ slug: string; updated_at: number }>(
    'SELECT slug, updated_at FROM events WHERE published = 1 AND is_sample = 0 AND (end_date >= $1 OR recurring = 1) ORDER BY updated_at DESC LIMIT 45000', [todayJST()]);
  const enSlugs = (await q<{ slug: string }>(`SELECT e.slug FROM events e JOIN event_i18n t ON t.event_id = e.id AND t.lang = 'en'
    WHERE e.published = 1 AND e.is_sample = 0 AND e.end_date >= $1`, [todayJST()]).catch(() => [])).map((r) => r.slug);
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/search`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: new Date(e.updated_at), changeFrequency: 'hourly' as const, priority: 0.8 })),
    // 英語版（訳のあるイベントだけ）
    { url: `${base}/en`, changeFrequency: 'hourly', priority: 0.7 },
    { url: `${base}/en/guide`, changeFrequency: 'monthly', priority: 0.5 },
    ...enSlugs.map((sl) => ({ url: `${base}/en/events/${sl}`, changeFrequency: 'hourly' as const, priority: 0.6 })),
  ];
}
