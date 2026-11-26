import 'server-only';
import { one, q } from './db';
import { siteUrl } from './site';
import { todayJST } from './dates';

/**
 * IndexNow：新しく公開・更新したイベントのページを、検索エンジン（Bing・Yandex など。Google は対象外）にすぐ知らせる。
 * 鍵は環境変数 INDEXNOW_KEY（英数字8〜128文字。公開される前提の値で、秘密ではない）。未設定なら何もしない。
 * 鍵のファイルは /indexnow-key.txt（app/indexnow-key.txt/route.ts）で配る。
 * Google には IndexNow も Indexing API（求人・ライブ配信のページ専用）も使えないため、サイトマップで知らせる。
 */
export const indexNowKey = () => (process.env.INDEXNOW_KEY || '').trim().match(/^[A-Za-z0-9-]{8,128}$/)?.[0] ?? '';

/** 前回から更新・公開されたイベントのURLを送る（定期実行・最大1万件。前回の時刻は app_settings に覚える） */
export async function pingIndexNow(): Promise<{ sent: number; skipped?: string }> {
  const key = indexNowKey();
  if (!key) return { sent: 0, skipped: 'INDEXNOW_KEY が未設定です' };
  const last = Number((await one<{ value: string }>("SELECT value FROM app_settings WHERE key = 'indexnow_at'"))?.value ?? 0);
  const now = Date.now();
  const rows = await q<{ slug: string }>(`SELECT slug FROM events WHERE published = 1 AND is_sample = 0 AND updated_at > $1
    AND (end_date >= $2 OR recurring = 1) ORDER BY updated_at DESC LIMIT 10000`, [last || now - 86400_000, todayJST()]);
  const base = siteUrl();
  if (rows.length) {
    const host = new URL(base).host;
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow-key.txt`, urlList: rows.map((r) => `${base}/events/${r.slug}`) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 202) throw new Error(`IndexNow ${res.status}`);
  }
  await q("INSERT INTO app_settings (key, value) VALUES ('indexnow_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(now)]);
  return { sent: rows.length };
}
