import { indexNowKey } from '@/lib/indexnow';

/** IndexNow の鍵のファイル（検索エンジンが「このサイトの持ち主が送った」ことを確かめるために読む） */
export function GET() {
  const key = indexNowKey();
  return new Response(key || 'not configured', { status: key ? 200 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
