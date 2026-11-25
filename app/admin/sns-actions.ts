'use server';
import { revalidatePath } from 'next/cache';
import { one, q } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { setSetting } from '@/lib/collect/run';
import { snsSettings } from '@/lib/sns/settings';
import { buildDrafts, saveDrafts } from '@/lib/sns/compose';
import { tryPost } from '@/lib/sns/post';
import { X_LIMIT, xLength } from '@/lib/share';

export async function saveSnsSettings(f: FormData) {
  await requireAdmin();
  const clamp = (k: string, min: number, max: number, def: number) => {
    const v = Number(f.get(k));
    return String(Number.isFinite(v) && String(f.get(k) ?? '').trim() !== '' ? Math.min(Math.max(Math.round(v), min), max) : def);
  };
  await setSetting('sns_daily_max', clamp('daily_max', 1, 50, 5));
  await setSetting('sns_min_interval_min', clamp('min_interval_min', 0, 720, 30));
  await setSetting('sns_live_min_users', clamp('live_min_users', 2, 20, 2));
  await setSetting('sns_live_gap_min', clamp('live_gap_min', 30, 720, 60));
  await setSetting('sns_auto_post', f.get('auto_post') ? '1' : '0');
  await setSetting('sns_auto_kinds', f.getAll('auto_kinds').map(String).filter((k) => ['pre', 'today', 'live'].includes(k)).join(','));
  revalidatePath('/admin/sns/x');
}

/** いまの状況から下書きを作る（すでにある下書き・投稿済み・取り消したものは作り直さない） */
export async function generateDrafts(): Promise<string> {
  await requireAdmin();
  const s = await snsSettings();
  const n = await saveDrafts(await buildDrafts(s));
  revalidatePath('/admin/sns/x');
  return n ? `下書きを${n}件作りました` : '新しく作る下書きはありません（明日・今日開催のイベントや、複数人からの現地の投稿がないとき）';
}

export async function saveDraftText(id: number, text: string): Promise<string | null> {
  await requireAdmin();
  const t = text.trim();
  if (!t) return '本文が空です';
  if (xLength(t) > X_LIMIT) return `長すぎます（${xLength(t)} / ${X_LIMIT}）`;
  await q("UPDATE sns_posts SET text = $1, updated_at = $2 WHERE id = $3 AND status IN ('draft', 'failed')", [t, Date.now(), id]);
  revalidatePath('/admin/sns/x');
  return null;
}

export async function cancelDraft(id: number) {
  await requireAdmin();
  await q("UPDATE sns_posts SET status = 'canceled', updated_at = $1 WHERE id = $2 AND status IN ('draft', 'failed')", [Date.now(), id]);
  revalidatePath('/admin/sns/x');
}

/** 投稿する（手動）。投稿の直前に、内容がいまも正しいか・上限を超えないかを確かめる */
export async function postDraft(id: number): Promise<string | null> {
  await requireAdmin();
  const r = await tryPost(id);
  revalidatePath('/admin/sns/x');
  return r;
}
