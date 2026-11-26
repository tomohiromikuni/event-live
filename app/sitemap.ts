import type { MetadataRoute } from 'next';
import { q } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import { todayJST } from '@/lib/dates';
import { FOREIGN, lp } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 検索エンジン向けサイトマップ（アクセスのたびにデータベースから作る＝新しいイベントは公開した時点で自動で入る）。
 * - lastmod はイベントの更新日時（イベント情報の編集・自動収集での更新・会場マップの変更で進む。来場者の混雑の投稿では進めない）
 * - 終了したイベント：「毎年開催」は残す（翌年に同じURLで復活）、一度きりは外す（ページも noindex）
 * - サンプル（架空）・非公開は含めない。robots.txt にこのサイトマップの場所を書いている
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const events = await q<{ slug: string; updated_at: number }>(
    'SELECT slug, updated_at FROM events WHERE published = 1 AND is_sample = 0 AND (end_date >= $1 OR recurring = 1) ORDER BY updated_at DESC LIMIT 45000', [todayJST()]);
  const translated = await q<{ slug: string; lang: string; updated_at: number }>(`SELECT e.slug, t.lang, e.updated_at FROM events e JOIN event_i18n t ON t.event_id = e.id
    WHERE e.published = 1 AND e.is_sample = 0 AND e.end_date >= $1`, [todayJST()]).catch(() => []);
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/search`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/sponsor`, changeFrequency: 'monthly', priority: 0.2 },
    ...events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: new Date(e.updated_at), changeFrequency: 'hourly' as const, priority: 0.8 })),
    // 外国語版（英語・中国語・韓国語。イベントは訳のあるものだけ）
    ...FOREIGN.flatMap((l) => [
      { url: `${base}${lp(l)}`, changeFrequency: 'hourly' as const, priority: 0.7 },
      { url: `${base}${lp(l)}/guide`, changeFrequency: 'monthly' as const, priority: 0.5 },
    ]),
    ...translated.filter((r) => (FOREIGN as string[]).includes(r.lang)).map((r) => ({ url: `${base}/${r.lang}/events/${r.slug}`, lastModified: new Date(r.updated_at), changeFrequency: 'hourly' as const, priority: 0.6 })),
  ];
}
