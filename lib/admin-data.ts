import 'server-only';
import { q } from './db';
import { listCategories, listGenres } from './queries';

export async function formData(eventId?: number) {
  const [genres, categories, gc] = await Promise.all([
    listGenres(),
    listCategories(),
    q<{ genre_id: number; category_id: number }>('SELECT genre_id, category_id FROM genre_categories'),
  ]);
  const genreDefaults: Record<number, number[]> = {};
  for (const r of gc) (genreDefaults[r.genre_id] ??= []).push(r.category_id);
  const customCategoryIds = eventId
    ? (await q<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eventId])).map((r) => r.category_id)
    : [];
  return { genres, categories, genreDefaults, customCategoryIds };
}

/** 未対応の件数（管理メニューのバッジ・一覧上部の帯で使う） */
export async function pendingCounts() {
  const [row] = await q<{ flags: number; removals: number; inquiries: number }>(`SELECT
      (SELECT COUNT(DISTINCT report_id)::int FROM report_flags WHERE resolved = 0) AS flags,
      (SELECT COUNT(*)::int FROM inquiries WHERE status = 'new' AND kind = 'removal') AS removals,
      (SELECT COUNT(*)::int FROM inquiries WHERE status = 'new' AND kind <> 'removal') AS inquiries`);
  return row ?? { flags: 0, removals: 0, inquiries: 0 };
}
