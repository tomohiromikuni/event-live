import 'server-only';
import { q } from '../db';
import { buildDrafts, saveDrafts } from './compose';
import { tryPost } from './post';
import { snsSettings } from './settings';
import { xReady } from './x';

/** 日本時間の「時」 */
const hourJST = () => new Date(Date.now() + 9 * 3600_000).getUTCHours();

/** 投稿してよい時間帯（夜中・早朝には投稿しない）。前日案内は夕方以降、当日案内は朝から */
function inWindow(kind: string, h: number) {
  if (kind === 'pre') return h >= 17 && h < 22;
  if (kind === 'today') return h >= 7 && h < 20;
  if (kind === 'live') return h >= 8 && h < 23;
  return false;
}

/**
 * 定期実行（15分ごと）：下書きを作り、自動投稿がONなら決まった種類を1件だけ投稿する（1回1件＝連投しない）。
 * 中止・延期は内容が重要なので、常に管理画面で確認してから手動で投稿する。
 */
export async function runSnsCron() {
  const s = await snsSettings();
  const created = await saveDrafts(await buildDrafts(s));
  if (!s.autoPost) return { created, posted: 0, note: '自動投稿はOFF（下書きまで）' };
  if (!xReady()) return { created, posted: 0, note: 'X の認証情報が未設定' };
  const h = hourJST();
  const kinds = s.autoKinds.filter((k) => inWindow(k, h));
  if (!kinds.length) return { created, posted: 0, note: '投稿する時間帯ではありません' };
  // 現地の投稿は新しいものから、案内は古いものから（作った順）
  const ph = kinds.map((_, i) => '$' + (i + 1)).join(', ');
  const drafts = await q<{ id: number; kind: string }>(`SELECT id, kind FROM sns_posts WHERE status = 'draft' AND kind IN (${ph})
    ORDER BY (kind = 'live') DESC, CASE WHEN kind = 'live' THEN -created_at ELSE created_at END LIMIT 5`, kinds);
  for (const d of drafts) {
    const err = await tryPost(d.id);
    if (!err) return { created, posted: 1, note: `投稿しました（#${d.id}）` };
    if (/上限|たっていません/.test(err)) return { created, posted: 0, note: err }; // 上限・間隔のときは次の回へ
  }
  return { created, posted: 0, note: drafts.length ? '投稿できる下書きはありませんでした' : '投稿待ちの下書きはありません' };
}
